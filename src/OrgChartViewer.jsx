import React, { useState, useMemo, useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Lock, Search, X, Mail, MapPin, Calendar, Users, ChevronRight, Link2, Check, Layers, MoreHorizontal } from "lucide-react";

/* ----------------------------- Data generation ---------------------------- */

const FIRST = ["Maya","Liam","Aria","Noah","Zoe","Eli","Ivy","Owen","Nina","Cole","Ada","Rhys","Tess","Jude","Lena","Finn","Cleo","Mara","Vera","Otto","Iris","Dax","Esme","Ravi","Nora","Beau","Juno","Kai","Wren","Hugo","Pia","Theo","Lux","Sage","Bram","Eva","Joel","Mira","Asa","Remy","Dahl","Niko","Faye","Sol","Pax","Indi","Roan","Quin","Tara","Milo"];
const LAST = ["Reyes","Cho","Vance","Okafor","Lund","Saito","Petrov","Ahmadi","Diaz","Knox","Bauer","Mercer","Nair","Lowry","Frost","Singh","Cruz","Halls","Webb","Ono","Quill","Adler","Mora","Dunn","Hart","Voss","Rana","Kemp","Sloan","Bly","Pike","Tate","Yoon","Cano","Ree","Sabo","Lim","Fenn","Garza","Roe"];
const CITIES = ["Sydney","Melbourne","Brisbane","Perth","Auckland","Singapore","London","Berlin","Toronto","Austin"];
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

let counter = 0;
function person(roleLabel, dept) {
  const f = FIRST[counter % FIRST.length];
  const l = LAST[(counter * 7) % LAST.length];
  counter++;
  const seed = counter * 13;
  const name = `${f} ${l}`;
  return {
    id: `p${counter}`,
    name,
    role: roleLabel,
    dept,
    email: `${f.toLowerCase()}.${l.toLowerCase()}@acme.co`,
    location: CITIES[seed % CITIES.length],
    startYear: 2016 + (seed % 9),
    startMonth: MONTHS[seed % 12],
    children: [],
  };
}

function buildOrg() {
  counter = 0;
  const depts = ["Product", "Engineering", "Design", "Operations"];

  const ceo = person("Chief Executive Officer", "Executive");

  const execs = Array.from({ length: 4 }, (_, i) => person("Executive Director", depts[i]));
  ceo.children = execs;

  const assocDirs = Array.from({ length: 6 }, (_, i) => person("Associate Director", depts[i % 4]));
  assocDirs.forEach((ad, i) => execs[i % execs.length].children.push(ad));

  const leads = Array.from({ length: 4 }, (_, i) => person("Lead", depts[i % 4]));
  leads.forEach((ld, i) => assocDirs[i % assocDirs.length].children.push(ld));

  const ics = [
    ...Array.from({ length: 13 }, (_, i) => person("Senior", depts[i % 4])),
    ...Array.from({ length: 13 }, (_, i) => person("Mid", depts[i % 4])),
    ...Array.from({ length: 13 }, (_, i) => person("Associate", depts[i % 4])),
    ...Array.from({ length: 13 }, (_, i) => person("Junior", depts[i % 4])),
  ];
  ics.forEach((ic, i) => leads[i % leads.length].children.push(ic));

  return ceo;
}

/* --------------------------------- Helpers -------------------------------- */

const AVATAR_BG = ["#1f2937","#7c3aed","#2563eb","#0d9488","#ca8a04","#65a30d","#db2777","#475569","#0891b2","#9333ea"];
function avatarColor(id) {
  const n = id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return AVATAR_BG[n % AVATAR_BG.length];
}
function initials(name) {
  return name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();
}
function countDescendants(node) {
  if (!node.children?.length) return 0;
  return node.children.reduce((sum, c) => sum + 1 + countDescendants(c), 0);
}
function chunkN(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function useColumns() {
  const get = () => {
    if (typeof window === "undefined") return 2;
    if (window.innerWidth >= 1024) return 4;
    if (window.innerWidth >= 768) return 3;
    return 2;
  };
  const [cols, setCols] = useState(get);
  useEffect(() => {
    const h = () => setCols(get());
    window.addEventListener("resize", h, { passive: true });
    return () => window.removeEventListener("resize", h);
  }, []);
  return cols;
}

/* Department color-coding */
const DEPTS = ["Product", "Engineering", "Design", "Operations", "Executive"];
const DEPT_COLOR = {
  Product:     "#7c3aed",
  Engineering: "#2563eb",
  Design:      "#db2777",
  Operations:  "#0d9488",
  Executive:   "#1f2937",
};

/* Build a flat index of every node plus a map from id -> path of ancestors
   (root..parent). Used for search, breadcrumbs, and auto-expand. */
function indexTree(root) {
  const byId = {};
  const parentOf = {};
  const depthOf = {};
  const flat = [];
  let maxDepth = 0;
  const walk = (node, parent, depth) => {
    byId[node.id] = node;
    parentOf[node.id] = parent ? parent.id : null;
    depthOf[node.id] = depth;
    if (depth > maxDepth) maxDepth = depth;
    flat.push(node);
    node.children?.forEach((c) => walk(c, node, depth + 1));
  };
  walk(root, null, 0);
  return { byId, parentOf, depthOf, flat, maxDepth };
}

/* Ancestor ids from root down to (but not including) the node itself. */
function pathToRoot(id, parentOf) {
  const path = [];
  let cur = parentOf[id];
  while (cur) {
    path.unshift(cur);
    cur = parentOf[cur];
  }
  return path;
}

/* ------------------------------- Person Card ------------------------------ */
/* Avatar overlaps the top of the card; name + role centered; count pill
   straddles the bottom edge. Mirrors the TheOrg layout from the reference. */

const OrgContext = React.createContext({
  onSelect: () => {},
  deptFilter: new Set(),
  matchIds: null,
  cols: 2,
});

function PersonCard({ node, isOpen, onToggle, dark, locked, showTotal }) {
  const { onSelect, deptFilter, matchIds, focusId } = React.useContext(OrgContext);
  const hasChildren = node.children && node.children.length > 0;
  const pillCount = useMemo(
    () => showTotal ? countDescendants(node) : node.children?.length || 0,
    [node, showTotal]
  );
  const color = DEPT_COLOR[node.dept] || avatarColor(node.id);
  const dimmed = deptFilter.size > 0 && !deptFilter.has(node.dept) && node.dept !== "Executive";
  const highlight = matchIds && matchIds.has(node.id);
  const focused = focusId === node.id;

  return (
    <div
      className={`oc-cardwrap ${dimmed ? "is-dimmed" : ""} ${highlight ? "is-highlight" : ""} ${focused ? "is-focused" : ""}`}
      id={`card-${node.id}`}
    >
      {/* Avatar overlapping the top — colored by department */}
      <div className="oc-avatar" style={{ backgroundColor: locked ? "#cbd5e1" : color }}>
        {locked ? "" : initials(node.name)}
      </div>

      <div className={`oc-card ${dark ? "oc-card--dark" : ""} ${locked ? "oc-card--locked" : ""}`}>
        <button
          className="oc-card-body oc-card-open"
          onClick={() => !locked && onSelect && onSelect(node)}
          disabled={locked}
        >
          {locked ? (
            <>
              <div className="oc-skeleton oc-skeleton--name" />
              <div className="oc-lock"><Lock size={15} /></div>
              <div className="oc-skeleton oc-skeleton--role" />
            </>
          ) : (
            <>
              <p className="oc-name">{node.name}</p>
              <p className="oc-role">{node.role}</p>
              <span className="oc-dept" style={{ color }}>{node.dept}</span>
            </>
          )}
        </button>

        {hasChildren && !locked && (
          <button
            onClick={onToggle}
            className={`oc-pill ${dark ? "oc-pill--dark" : "oc-pill--light"}`}
            aria-expanded={isOpen}
          >
            <span className="oc-pill-num">{pillCount.toLocaleString()}</span>
            <span className={`oc-pill-chev ${isOpen ? "is-open" : ""}`}>
              {isOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- Branch --------------------------------- */

/* Collects every non-leaf node in depth-first pre-order so they can be
   rendered as a flat list of sibling containers rather than nested ones. */
function collectAllParents(node) {
  const result = [];
  const walk = (n) => {
    if (n.children?.length > 0) {
      result.push(n);
      n.children.forEach(walk);
    }
  };
  walk(node);
  return result;
}

/* A single expanded group — brace header + flat grid of direct children.
   No recursive nesting; Branch renders all groups as siblings. */
function FlatGroup({ parent, expandedSet, toggle, parentOf }) {
  const { cols, onSelect } = React.useContext(OrgContext);

  /* Open only when this node AND every ancestor are in expandedSet. */
  const isOpen = useMemo(() => {
    if (!expandedSet.has(parent.id)) return false;
    let cur = parentOf[parent.id];
    while (cur) {
      if (!expandedSet.has(cur)) return false;
      cur = parentOf[cur];
    }
    return true;
  }, [parent.id, expandedSet, parentOf]);

  const rows = useMemo(() => chunkN(parent.children, cols), [parent.children, cols]);

  return (
    <div className={`oc-children ${isOpen ? "is-open" : ""}`} id={`children-${parent.id}`}>
      <div className="oc-children-inner">
        <div className="oc-brace">
          <div className="oc-brace-bar">
            <button className="oc-brace-parent" onClick={() => onSelect(parent)}>
              <span className="oc-brace-dot" style={{ backgroundColor: DEPT_COLOR[parent.dept] || avatarColor(parent.id) }}>{initials(parent.name)}</span>
              <span className="oc-brace-name">{parent.name}</span>
            </button>
            <button className="oc-collapse" onClick={() => toggle(parent.id)}>
              Collapse <ChevronUp size={15} />
            </button>
          </div>
        </div>

        {rows.map((row, rowIdx) => {
          const colOffset = row.length < cols ? Math.floor((cols - row.length) / 2) : 0;
          return (
            <div
              key={`row-${rowIdx}`}
              className="oc-grid"
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}
            >
              {row.map((child, i) => {
                const childHasKids = child.children?.length > 0;
                const childOpen = expandedSet.has(child.id);
                return (
                  <div
                    className="oc-grid-cell"
                    key={child.id}
                    style={{
                      "--i": rowIdx * cols + i,
                      ...(i === 0 && colOffset > 0 ? { gridColumnStart: colOffset + 1 } : {}),
                    }}
                  >
                    <PersonCard
                      node={child}
                      isOpen={childOpen}
                      onToggle={() => childHasKids && toggle(child.id)}
                      dark={false}
                    />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Branch({ node, expandedSet, toggle, isRoot, parentOf }) {
  const { cols } = React.useContext(OrgContext);
  const hasChildren = node.children?.length > 0;

  const allParents = useMemo(() => collectAllParents(node), [node]);

  return (
    <div className={`oc-branch ${isRoot ? "oc-branch--root" : ""}`}>
      <div style={isRoot ? { width: "100%", maxWidth: `calc((100% - 104px - ${(cols - 1) * 14}px) / ${cols})` } : undefined}>
        <PersonCard
          node={node}
          isOpen={expandedSet.has(node.id)}
          onToggle={() => hasChildren && toggle(node.id)}
          dark={isRoot}
          showTotal={isRoot}
        />
      </div>

      {allParents.map(parent => (
        <FlatGroup
          key={parent.id}
          parent={parent}
          expandedSet={expandedSet}
          toggle={toggle}
          parentOf={parentOf}
        />
      ))}
    </div>
  );
}

/* ------------------------------ Detail Panel ------------------------------ */

function DetailPanel({ node, index, onClose, onJump }) {
  const [bioExpanded, setBioExpanded] = useState(false);
  useEffect(() => { setBioExpanded(false); }, [node?.id]);

  const open = !!node;
  const color = node ? (DEPT_COLOR[node.dept] || avatarColor(node.id)) : "#000";
  const reports = node?.children?.length || 0;
  const crumbs = node ? pathToRoot(node.id, index.parentOf).map((id) => index.byId[id]) : [];
  const manager = crumbs.length > 0 ? crumbs[crumbs.length - 1] : null;

  const bio = node
    ? `${node.name} is a ${node.role} within the ${node.dept} team at ACME. Based in ${node.location}, they joined in ${node.startMonth} ${node.startYear}.${reports > 0 ? ` They manage ${reports} direct ${reports === 1 ? "report" : "reports"} and lead a team across the organisation.` : ""}`
    : "";
  const BIO_LIMIT = 220;

  /* Activity items derived from available person data */
  const activityItems = node ? [
    { label: node.email,                  sub: `${node.dept} · Team`          },
    { label: `Based in ${node.location}`, sub: "Location"                      },
    { label: `Joined ${node.startMonth} ${node.startYear}`, sub: "Start date" },
  ] : [];

  return (
    <>
      <div className={`oc-scrim ${open ? "is-open" : ""}`} onClick={onClose} />
      <aside className={`oc-panel ${open ? "is-open" : ""}`} role="dialog" aria-hidden={!open}>
        {node && (
          <div className="oc-panel-scroll">

            {/* Header: avatar · name/role · close */}
            <div className="oc-panel-head">
              <div className="oc-panel-avatar" style={{ backgroundColor: color }}>
                {initials(node.name)}
              </div>
              <div className="oc-panel-hero-text">
                <h2 className="oc-panel-name">{node.name}</h2>
                <p className="oc-panel-role">{node.role}</p>
              </div>
              <button className="oc-panel-close" onClick={onClose} aria-label="Close">
                <X size={14} />
              </button>
            </div>

            {/* Action buttons */}
            <div className="oc-panel-actions">
              <button className="oc-panel-action-btn">
                <Mail size={16} /><span>Contact</span>
              </button>
              <button className="oc-panel-action-btn">
                <Users size={16} /><span>View profile</span>
              </button>
            </div>

            {/* Bio */}
            <div className="oc-panel-bio">
              {bioExpanded ? bio : bio.slice(0, BIO_LIMIT) + (bio.length > BIO_LIMIT ? "…" : "")}
              {bio.length > BIO_LIMIT && (
                <button className="oc-panel-bio-more" onClick={() => setBioExpanded(v => !v)}>
                  {bioExpanded ? " Less" : " More"}
                </button>
              )}
            </div>

            {/* Reports to */}
            {manager && (
              <>
                <hr className="oc-panel-divider" />
                <div className="oc-panel-section">
                  <p className="oc-panel-section-title">Reports to</p>
                  <div className="oc-panel-people-list">
                    <button className="oc-panel-person-row" onClick={() => onJump(manager.id)}>
                      <div className="oc-panel-person-avatar" style={{ backgroundColor: DEPT_COLOR[manager.dept] || avatarColor(manager.id) }}>
                        {initials(manager.name)}
                      </div>
                      <div className="oc-panel-person-info">
                        <p className="oc-panel-person-name">{manager.name}</p>
                        <p className="oc-panel-person-role">{manager.role}</p>
                      </div>
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Direct reports */}
            {reports > 0 && (
              <>
                <hr className="oc-panel-divider" />
                <div className="oc-panel-section">
                  <p className="oc-panel-section-title">Direct reports</p>
                  <div className="oc-panel-people-list">
                    {node.children.slice(0, 4).map((c) => (
                      <button key={c.id} className="oc-panel-person-row" onClick={() => onJump(c.id)}>
                        <div className="oc-panel-person-avatar" style={{ backgroundColor: DEPT_COLOR[c.dept] || avatarColor(c.id) }}>
                          {initials(c.name)}
                        </div>
                        <div className="oc-panel-person-info">
                          <p className="oc-panel-person-name">{c.name}</p>
                          <p className="oc-panel-person-role">{c.role}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {/* Activity */}
            <hr className="oc-panel-divider" />
            <div className="oc-panel-section">
              <p className="oc-panel-section-title">Activity</p>
              <div className="oc-panel-activity-list">
                {activityItems.map((item, i) => (
                  <div key={i} className="oc-panel-activity-item">
                    <div className="oc-panel-activity-avatar" />
                    <div className="oc-panel-person-info">
                      <p className="oc-panel-person-name">{item.label}</p>
                      <p className="oc-panel-person-role">{item.sub}</p>
                    </div>
                  </div>
                ))}
              </div>
              <button className="oc-panel-view-more">View more activity</button>
            </div>

          </div>
        )}
      </aside>
    </>
  );
}

/* --------------------------------- App ------------------------------------ */

export default function OrgChartViewer() {
  const root = useMemo(() => buildOrg(), []);
  const index = useMemo(() => indexTree(root), [root]);
  const cols = useColumns();

  // ---- URL state: only selected person is persisted (no expand caching) ----
  const initialSel = useMemo(() => {
    try {
      return new URLSearchParams(window.location.search).get("sel") || null;
    } catch { return null; }
  }, []);

  const [expanded, setExpanded] = useState(new Set());
  const [selected, setSelected] = useState(
    initialSel && index.byId[initialSel] ? index.byId[initialSel] : null
  );
  const [query, setQuery] = useState("");
  const [deptFilter, setDeptFilter] = useState(new Set());
  const [deptOpen, setDeptOpen] = useState(false);
  const filterRef = useRef(null);
  const [levelFilter, setLevelFilter] = useState(null);
  const [levelOpen, setLevelOpen] = useState(false);
  const levelRef = useRef(null);
  const [focusId, setFocusId] = useState(null);     // keyboard focus
  const [crumbId, setCrumbId] = useState(null);      // sticky breadcrumb anchor
  // Records the most recent toggle so we can scroll after the DOM updates.
  const lastAction = useRef(null);

  // Persist selected person to URL for shareable links.
  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      selected ? p.set("sel", selected.id) : p.delete("sel");
      const qs = p.toString();
      window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
    } catch { /* sandboxed: ignore */ }
  }, [selected]);

  // Close dept dropdown on outside click.
  useEffect(() => {
    if (!deptOpen) return;
    const h = (e) => { if (filterRef.current && !filterRef.current.contains(e.target)) setDeptOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [deptOpen]);

  // Close level dropdown on outside click.
  useEffect(() => {
    if (!levelOpen) return;
    const h = (e) => { if (levelRef.current && !levelRef.current.contains(e.target)) setLevelOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [levelOpen]);

  const toggle = (id) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        lastAction.current = { id, type: "collapse" };
      } else {
        next.add(id);
        lastAction.current = { id, type: "expand" };
      }
      return next;
    });

  // Reveal a node: expand every ancestor so its card is visible, then scroll.
  const revealNode = (id) => {
    const ancestors = pathToRoot(id, index.parentOf);
    setExpanded((prev) => {
      const next = new Set(prev);
      ancestors.forEach((a) => next.add(a));
      return next;
    });
    lastAction.current = { id, type: "reveal" };
  };

  // Expand every node shallower than `level` (so depth 0..level-1 are open).
  const expandToLevel = (level) => {
    const ids = index.flat
      .filter((n) => n.children?.length && index.depthOf[n.id] < level)
      .map((n) => n.id);
    setExpanded(new Set(ids));
    lastAction.current = null;
  };

  // Search matches (by name or role). Empty query => no matches set.
  const matchIds = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return null;
    const ids = new Set();
    index.flat.forEach((n) => {
      if (n.name.toLowerCase().includes(q) || n.role.toLowerCase().includes(q)) ids.add(n.id);
    });
    return ids;
  }, [query, index]);

  const results = useMemo(() => {
    if (!matchIds) return [];
    return index.flat.filter((n) => matchIds.has(n.id)).slice(0, 8);
  }, [matchIds, index]);

  // After expand/collapse/reveal, smoothly anchor the viewport.
  useEffect(() => {
    const action = lastAction.current;
    if (!action) return;
    lastAction.current = null;

    const targetId =
      action.type === "collapse" ? `card-${action.id}`
      : action.type === "reveal" ? `card-${action.id}`
      : `children-${action.id}`;

    const t = setTimeout(() => {
      const el = document.getElementById(targetId);
      if (el) el.scrollIntoView({ behavior: "smooth", block: action.type === "reveal" ? "center" : "start" });
    }, 360);

    return () => clearTimeout(t);
  }, [expanded]);

  const goToPerson = (id) => {
    revealNode(id);
    setSelected(index.byId[id]);
    setFocusId(id);
    setQuery("");
  };

  // ---- Sticky breadcrumb: track the topmost visible card while scrolling ----
  useEffect(() => {
    const cards = () => Array.from(document.querySelectorAll(".oc-cardwrap[id]"));
    let raf = null;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        const threshold = 200; // just below the sticky header
        let top = null;
        for (const el of cards()) {
          const r = el.getBoundingClientRect();
          if (r.bottom > threshold) { top = el; break; }
        }
        if (top) {
          const id = top.id.replace("card-", "");
          setCrumbId((prev) => (prev === id ? prev : id));
        }
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { window.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [expanded]);

  // ---- Keyboard navigation ----
  // Arrow keys move focus between visible cards (siblings/parent/child),
  // Enter expands/collapses or opens detail, Escape closes the panel/clears.
  const visibleIds = useMemo(() => {
    // A node is visible if all its ancestors are expanded.
    const out = [];
    const walk = (n) => {
      out.push(n.id);
      if (expanded.has(n.id)) n.children?.forEach(walk);
    };
    walk(root);
    return out;
  }, [expanded, root]);

  useEffect(() => {
    const onKey = (e) => {
      // Don't hijack typing in the search box.
      if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) {
        if (e.key === "Escape") { setQuery(""); e.target.blur(); }
        return;
      }
      if (e.key === "Escape") {
        if (selected) setSelected(null);
        else setFocusId(null);
        return;
      }
      const cur = focusId || visibleIds[0];
      if (!cur) return;
      const node = index.byId[cur];

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const i = visibleIds.indexOf(cur);
        const ni = e.key === "ArrowDown" ? Math.min(i + 1, visibleIds.length - 1) : Math.max(i - 1, 0);
        const nid = visibleIds[ni];
        setFocusId(nid);
        document.getElementById(`card-${nid}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (node?.children?.length && !expanded.has(cur)) toggle(cur);
        else if (node?.children?.length) setFocusId(node.children[0].id);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (expanded.has(cur)) toggle(cur);
        else {
          const parent = index.parentOf[cur];
          if (parent) setFocusId(parent);
        }
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (node?.children?.length) toggle(cur);
        else setSelected(node);
      } else if (e.key === " ") {
        e.preventDefault();
        setSelected(node);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusId, visibleIds, expanded, selected, index]);

  const allIds = useMemo(() => {
    const ids = [];
    const walk = (n) => { if (n.children?.length) { ids.push(n.id); n.children.forEach(walk); } };
    walk(root);
    return ids;
  }, [root]);

  const headcount = index.flat.length;

  const ctx = useMemo(
    () => ({ onSelect: (n) => { setSelected(n); setFocusId(n.id); }, deptFilter, matchIds, focusId, cols }),
    [deptFilter, matchIds, focusId, cols]
  );

  // Sticky breadcrumb chain for the topmost visible card.
  const crumbChain = useMemo(() => {
    if (!crumbId) return [];
    return [...pathToRoot(crumbId, index.parentOf), crumbId].map((id) => index.byId[id]).filter(Boolean);
  }, [crumbId, index]);

  const [copied, setCopied] = useState(false);
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard blocked in sandbox */ }
  };

  const LEVELS = ["CEO", "Directors", "Assoc.", "Leads", "Team"];

  const toggleLevel = (lvl) => {
    if (levelFilter === lvl) {
      setLevelFilter(null);
      setExpanded(new Set());
    } else {
      setLevelFilter(lvl);
      expandToLevel(lvl);
    }
  };

  return (
    <OrgContext.Provider value={ctx}>
      <div className="oc-root">
        <style>{CSS}</style>

        <header className="oc-header">
          {/* Row 1: Brand bar — title | Expand all + Reset + copy */}
          <div className="oc-header-inner">
            <div className="oc-header-brand">
              <h1 className="oc-title">Organization</h1>
              <p className="oc-subtitle">{headcount} people</p>
            </div>
            <div className="oc-actions">
              <button className="oc-btn oc-btn--dark" onClick={() => setExpanded(new Set(allIds))}>
                Expand all
              </button>
              <button className="oc-btn oc-btn--ghost" onClick={() => { setExpanded(new Set()); setDeptFilter(new Set()); setLevelFilter(null); setFocusId(null); }}>
                Reset
              </button>
              <button className="oc-btn oc-btn--icon" onClick={copyLink} aria-label="Copy shareable link" title="Copy shareable link">
                {copied ? <Check size={15} /> : <Link2 size={15} />}
              </button>
            </div>
          </div>

          {/* Row 2: Search (left) + filter dropdowns (right) on same line */}
          <div className="oc-search-toolbar">
            <div className="oc-search-wrap">
              <div className="oc-search">
                <Search size={16} className="oc-search-icon" />
                <input
                  className="oc-search-input"
                  placeholder="Search people or roles…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button className="oc-search-clear" onClick={() => setQuery("")} aria-label="Clear">
                    <X size={15} />
                  </button>
                )}
              </div>
              {results.length > 0 && (
                <div className="oc-results">
                  {results.map((r) => (
                    <button key={r.id} className="oc-result" onClick={() => goToPerson(r.id)}>
                      <span className="oc-result-dot" style={{ background: DEPT_COLOR[r.dept] || avatarColor(r.id) }}>
                        {initials(r.name)}
                      </span>
                      <span className="oc-result-text">
                        <span className="oc-result-name">{r.name}</span>
                        <span className="oc-result-role">{r.role} · {r.dept}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="oc-filters">
              {/* Teams filter */}
              <div className="oc-filter-wrap" ref={filterRef}>
                <button
                  className={`oc-filter-btn ${deptFilter.size > 0 ? "is-active" : ""}`}
                  onClick={() => setDeptOpen((o) => !o)}
                >
                  <Users size={14} />
                  <span>Teams{deptFilter.size > 0 ? ` (${deptFilter.size})` : ""}</span>
                  <ChevronDown size={13} className={`oc-filter-chev ${deptOpen ? "is-open" : ""}`} />
                </button>
                {deptOpen && (
                  <div className="oc-filter-dropdown">
                    {deptFilter.size > 0 && (
                      <button className="oc-filter-clear" onClick={() => setDeptFilter(new Set())}>
                        Clear filter
                      </button>
                    )}
                    {DEPTS.filter((d) => d !== "Executive").map((d) => (
                      <label key={d} className="oc-filter-option">
                        <input
                          type="checkbox"
                          className="oc-filter-checkbox"
                          checked={deptFilter.has(d)}
                          onChange={() => {
                            setDeptFilter((prev) => {
                              const next = new Set(prev);
                              next.has(d) ? next.delete(d) : next.add(d);
                              return next;
                            });
                          }}
                        />
                        <span className="oc-filter-dot" style={{ background: DEPT_COLOR[d] }} />
                        {d}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Role type filter */}
              <div className="oc-filter-wrap" ref={levelRef}>
                <button
                  className={`oc-filter-btn ${levelFilter !== null ? "is-active" : ""}`}
                  onClick={() => setLevelOpen((o) => !o)}
                >
                  <Layers size={14} />
                  <span>Role type{levelFilter !== null ? ` (${LEVELS[levelFilter]})` : ""}</span>
                  <ChevronDown size={13} className={`oc-filter-chev ${levelOpen ? "is-open" : ""}`} />
                </button>
                {levelOpen && (
                  <div className="oc-filter-dropdown oc-filter-dropdown--right">
                    {levelFilter !== null && (
                      <button className="oc-filter-clear" onClick={() => { setLevelFilter(null); setExpanded(new Set()); }}>
                        Clear filter
                      </button>
                    )}
                    {LEVELS.map((label, lvl) => (
                      <label key={lvl} className="oc-filter-option">
                        <input
                          type="checkbox"
                          className="oc-filter-checkbox"
                          checked={levelFilter === lvl}
                          onChange={() => toggleLevel(lvl)}
                        />
                        <span>{label}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* Sticky breadcrumb — reflects the topmost visible card while scrolling */}
        {crumbChain.length > 1 && (
          <div className="oc-crumbbar">
            <div className="oc-crumbbar-inner">
              {crumbChain.map((c, i) => (
                <React.Fragment key={c.id}>
                  {i > 0 && <ChevronRight size={12} className="oc-crumb-sep" />}
                  <button
                    className={`oc-crumb ${i === crumbChain.length - 1 ? "is-current" : ""}`}
                    onClick={() => goToPerson(c.id)}
                  >
                    {c.name}
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}

        <main className="oc-main">
          <Branch node={root} expandedSet={expanded} toggle={toggle} isRoot={true} parentOf={index.parentOf} />
        </main>

        <DetailPanel
          node={selected}
          index={index}
          onClose={() => setSelected(null)}
          onJump={goToPerson}
        />
      </div>
    </OrgContext.Provider>
  );
}

/* --------------------------------- Styles --------------------------------- */

const CSS = `
/* Smooth CSS scrolling + offset so the sticky header never covers an anchor */
html{ scroll-behavior:smooth; }
.oc-cardwrap[id], .oc-children[id]{ scroll-margin-top:150px; scroll-margin-bottom:24px; }

.oc-root{
  min-height:100vh;
  background:
    radial-gradient(120% 80% at 50% -10%, #f1f5f9 0%, #f8fafc 45%, #f8fafc 100%);
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color:#0f172a;
  -webkit-font-smoothing:antialiased;
}

/* Header */
.oc-header{
  position:sticky; top:0; z-index:20;
  background:rgba(255,255,255,.88);
  backdrop-filter:saturate(180%) blur(14px);
  border-bottom:1px solid #e9edf2;
}
.oc-header-inner{
  max-width:640px; margin:0 auto; padding:14px 16px 10px;
  display:flex; align-items:center; justify-content:space-between; gap:12px;
}
.oc-header-brand{ display:flex; flex-direction:column; }
.oc-title{ font-size:18px; font-weight:700; letter-spacing:-.02em; margin:0; line-height:1.15; }
.oc-subtitle{ font-size:12px; color:#94a3b8; margin:3px 0 0; letter-spacing:.01em; }
.oc-actions{ display:flex; gap:6px; }
.oc-btn{
  font-size:12px; font-weight:600; padding:7px 12px; border-radius:10px;
  border:1px solid transparent; cursor:pointer;
  transition:background .18s ease, color .18s ease, transform .12s ease, box-shadow .18s ease;
}
.oc-btn:active{ transform:scale(.96); }
.oc-btn--dark{ background:#0f172a; color:#fff; box-shadow:0 1px 2px rgba(15,23,42,.25); }
.oc-btn--dark:hover{ background:#1e293b; }
.oc-btn--ghost{ background:#eef2f7; color:#334155; }
.oc-btn--ghost:hover{ background:#e2e8f0; }
.oc-btn--icon{ background:#eef2f7; color:#334155; padding:7px 9px; display:grid; place-items:center; }
.oc-btn--icon:hover{ background:#e2e8f0; }

/* Search + filter toolbar row */
.oc-search-toolbar{
  max-width:640px; margin:0 auto; padding:0 16px 12px;
  display:flex; align-items:center; gap:8px;
}
.oc-search-wrap{ position:relative; flex:1; min-width:0; }
.oc-filters{ display:flex; align-items:center; gap:6px; flex-shrink:0; }

.oc-search{
  display:flex; align-items:center; gap:8px;
  max-width:400px;
  background:#fff; border:1px solid #e2e8f0; border-radius:12px; padding:9px 12px;
  box-shadow:0 1px 2px rgba(15,23,42,.04);
  transition:border-color .18s ease, box-shadow .18s ease;
}
.oc-search:focus-within{ border-color:#94a3b8; box-shadow:0 0 0 3px rgba(148,163,184,.18); }
.oc-search-icon{ color:#94a3b8; flex:none; }
.oc-search-input{
  flex:1; border:none; outline:none; background:none;
  font-size:14px; color:#0f172a;
}
.oc-search-input::placeholder{ color:#94a3b8; }
.oc-search-clear{
  border:none; background:#f1f5f9; color:#64748b; cursor:pointer;
  width:22px; height:22px; border-radius:999px; display:grid; place-items:center;
  transition:background .15s ease;
}
.oc-search-clear:hover{ background:#e2e8f0; }
.oc-results{
  position:absolute; left:16px; right:auto; width:400px; max-width:calc(100% - 32px);
  top:calc(100% - 4px); z-index:30;
  background:#fff; border:1px solid #e7ebf0; border-radius:12px;
  box-shadow:0 12px 32px rgba(15,23,42,.14); overflow:hidden;
  animation:oc-fade .14s ease both;
}
.oc-result{
  display:flex; align-items:center; gap:10px; width:100%;
  padding:9px 12px; border:none; background:none; cursor:pointer; text-align:left;
  transition:background .12s ease;
}
.oc-result:hover{ background:#f6f8fa; }
.oc-result + .oc-result{ border-top:1px solid #f1f5f9; }
.oc-result-dot{
  width:30px; height:30px; border-radius:999px; flex:none;
  display:grid; place-items:center; color:#fff; font-size:11px; font-weight:700;
}
.oc-result-text{ display:flex; flex-direction:column; min-width:0; }
.oc-result-name{ font-size:13.5px; font-weight:600; color:#0f172a; }
.oc-result-role{ font-size:11.5px; color:#94a3b8; }

/* Department filter dropdown */
.oc-filter-wrap{ position:relative; display:inline-block; }
.oc-filter-btn{
  display:inline-flex; align-items:center; gap:7px;
  padding:7px 12px; border-radius:10px; cursor:pointer;
  font-size:12.5px; font-weight:600; color:#475569;
  background:#fff; border:1px solid #e2e8f0;
  transition:background .15s ease, border-color .15s ease, color .15s ease;
}
.oc-filter-btn:hover{ background:#f8fafc; border-color:#cbd5e1; }
.oc-filter-btn.is-active{ background:#0f172a; border-color:#0f172a; color:#fff; }
.oc-filter-chev{ transition:transform .2s ease; }
.oc-filter-chev.is-open{ transform:rotate(180deg); }
.oc-filter-dropdown{
  position:absolute; left:0; top:calc(100% + 6px); z-index:35; min-width:180px;
  background:#fff; border:1px solid #e7ebf0; border-radius:14px;
  box-shadow:0 8px 24px rgba(15,23,42,.13);
  overflow:hidden;
  animation:oc-fade .14s ease both;
}
.oc-filter-dropdown--right{ left:auto; right:0; }
.oc-filter-clear{
  display:block; width:100%; padding:9px 14px; text-align:left;
  border:none; border-bottom:1px solid #f1f5f9; background:none; cursor:pointer;
  font-size:12px; font-weight:600; color:#64748b;
  transition:background .12s ease;
}
.oc-filter-clear:hover{ background:#fafafa; }
.oc-filter-option{
  display:flex; align-items:center; gap:10px;
  padding:10px 14px; cursor:pointer;
  font-size:13px; font-weight:500; color:#1e293b;
  transition:background .12s ease;
}
.oc-filter-option:hover{ background:#f6f8fa; }
.oc-filter-option + .oc-filter-option{ border-top:1px solid #f1f5f9; }
.oc-filter-checkbox{ width:15px; height:15px; accent-color:#0f172a; cursor:pointer; flex:none; }
.oc-filter-dot{ width:9px; height:9px; border-radius:999px; flex:none; }


/* Sticky breadcrumb bar */
.oc-crumbbar{
  position:sticky; top:0; z-index:15;
  background:rgba(255,255,255,.9); backdrop-filter:saturate(180%) blur(10px);
  border-bottom:1px solid #eef2f6;
}
.oc-crumbbar-inner{
  max-width:640px; margin:0 auto; padding:8px 16px;
  display:flex; align-items:center; gap:2px; overflow-x:auto; white-space:nowrap;
}
.oc-crumbbar-inner::-webkit-scrollbar{ display:none; }
.oc-crumb{
  flex:none; border:none; background:none; cursor:pointer;
  font-size:12.5px; font-weight:600; color:#64748b; padding:3px 6px; border-radius:6px;
  transition:background .12s ease, color .12s ease;
}
.oc-crumb:hover{ background:#f1f5f9; color:#0f172a; }
.oc-crumb.is-current{ color:#0f172a; font-weight:700; }
.oc-crumb-sep{ color:#cbd5e1; flex:none; }

/* Detail panel + scrim */
.oc-scrim{
  position:fixed; inset:0; z-index:40; background:rgba(15,23,42,.35);
  opacity:0; pointer-events:none; transition:opacity .28s ease;
  backdrop-filter:blur(2px);
}
.oc-scrim.is-open{ opacity:1; pointer-events:auto; }

/* Panel — right-side drawer */
.oc-panel{
  position:fixed; z-index:50;
  top:8px; right:8px; bottom:8px; left:auto;
  width:90%; max-width:400px;
  background:#fff; border-radius:24px;
  overflow:hidden;
  transform:translateX(calc(100% + 16px));
  transition:transform .34s cubic-bezier(.32,.72,0,1);
  box-shadow:0 10px 12.5px rgba(0,0,0,.10), 0 4px 6px rgba(0,0,0,.06);
}
.oc-panel.is-open{ transform:translateX(0); }

/* Scroll — sections spaced by gap: 24px matching Figma */
.oc-panel-scroll{
  height:100%; overflow-y:auto;
  display:flex; flex-direction:column; gap:24px;
  padding:24px 0;
}
.oc-panel-scroll::-webkit-scrollbar{ width:4px; }
.oc-panel-scroll::-webkit-scrollbar-track{ background:transparent; }
.oc-panel-scroll::-webkit-scrollbar-thumb{ background:#e2e8f0; border-radius:4px; }

/* ── Panel header ── */
.oc-panel-head{
  display:flex; align-items:flex-start; gap:16px; padding:0 24px;
}
.oc-panel-avatar{
  width:64px; height:64px; border-radius:999px; flex-shrink:0;
  display:grid; place-items:center;
  color:#fff; font-size:20px; font-weight:700;
}
.oc-panel-hero-text{ flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; padding-top:2px; }
.oc-panel-name{ font-size:20px; font-weight:700; margin:0; color:#000; line-height:1.2; }
.oc-panel-role{ font-size:14px; font-weight:500; color:#6b7280; margin:0; line-height:1.3; }
.oc-panel-close{
  width:40px; height:40px; flex-shrink:0; border-radius:999px;
  border:none; background:#e6e6e6; color:#131313;
  cursor:pointer; display:grid; place-items:center;
  transition:background .15s;
}
.oc-panel-close:hover{ background:#d4d4d4; }

/* ── Action buttons ── */
.oc-panel-actions{ display:flex; gap:8px; padding:0 24px; }
.oc-panel-action-btn{
  display:inline-flex; align-items:center; gap:8px; flex:1;
  justify-content:center; height:40px; padding:0 16px; border-radius:4px;
  cursor:pointer; font-size:14px; font-weight:600; color:#131313;
  border:1px solid rgba(19,19,19,.25); background:#fff;
  transition:background .15s;
}
.oc-panel-action-btn:hover{ background:#f5f5f5; }

/* ── Bio ── */
.oc-panel-bio{ padding:0 24px; font-size:13px; line-height:1.6; color:#6b7280; }
.oc-panel-bio-more{
  border:none; background:none; cursor:pointer; padding:0; margin-left:2px;
  font-size:13px; font-weight:700; color:#000;
}

/* ── Divider ── */
.oc-panel-divider{ border:none; border-top:1px solid rgba(19,19,19,.15); margin:0; }

/* ── Sections ── */
.oc-panel-section{ display:flex; flex-direction:column; gap:16px; padding:0 24px; }
.oc-panel-section-title{ font-size:16px; font-weight:700; color:#000; margin:0; }

/* ── Person rows (Reports to / Direct reports) ── */
.oc-panel-people-list{ display:flex; flex-direction:column; gap:12px; }
.oc-panel-person-row{
  display:flex; align-items:center; gap:12px; width:100%;
  border:none; background:none; cursor:pointer; text-align:left; padding:0;
  transition:opacity .15s;
}
.oc-panel-person-row:hover{ opacity:.75; }
.oc-panel-person-avatar{
  width:40px; height:40px; border-radius:20px; flex-shrink:0;
  display:grid; place-items:center; color:#fff; font-size:12px; font-weight:700;
}
.oc-panel-person-info{ display:flex; flex-direction:column; gap:2px; min-width:0; }
.oc-panel-person-name{ font-size:14px; font-weight:600; color:#000; margin:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.oc-panel-person-role{ font-size:12px; font-weight:400; color:#6b7280; margin:0; }

/* ── Activity ── */
.oc-panel-activity-list{ display:flex; flex-direction:column; gap:12px; }
.oc-panel-activity-item{
  display:flex; align-items:center; gap:12px;
  border:1px solid rgba(19,19,19,.15); border-radius:4px; padding:16px;
}
.oc-panel-activity-avatar{
  width:40px; height:40px; border-radius:999px; flex-shrink:0;
  background:#e6e6e6;
}
.oc-panel-view-more{
  display:block; width:100%;
  height:40px; border-radius:4px;
  border:1px solid rgba(19,19,19,.25); background:#fff; cursor:pointer;
  font-size:14px; font-weight:600; color:#131313;
  transition:background .15s;
}
.oc-panel-view-more:hover{ background:#f5f5f5; }

@keyframes oc-fade{ from{ opacity:0; transform:translateY(-4px); } to{ opacity:1; transform:translateY(0); } }

.oc-main{ max-width:640px; margin:0 auto; padding:40px 16px 80px; }

/* Branch / card wrap.
   padding-top reserves room for the avatar overlapping the top edge;
   padding-bottom reserves room for the count pill overlapping the bottom edge.
   With both protrusions contained inside the wrap box, grid gaps are pure
   spacing between boxes and avatars/pills can never overlap adjacent rows. */
.oc-branch{ display:flex; flex-direction:column; align-items:center; }
.oc-cardwrap{ position:relative; width:100%; padding-top:26px; padding-bottom:19px; }

/* Avatar overlapping top edge */
.oc-avatar{
  position:absolute; top:0; left:50%; transform:translateX(-50%);
  width:52px; height:52px; border-radius:999px;
  display:grid; place-items:center;
  color:#fff; font-weight:600; font-size:14px;
  border:3px solid #fff;
  box-shadow:0 3px 8px rgba(15,23,42,.18);
  z-index:2;
  transition:transform .25s cubic-bezier(.34,1.56,.64,1);
}
.oc-cardwrap:hover .oc-avatar{ transform:translateX(-50%) scale(1.06); }

/* Card */
.oc-card{
  position:relative;
  background:#fff;
  border:1px solid #e7ebf0;
  border-radius:18px;
  padding:34px 14px 26px;
  box-shadow:0 1px 2px rgba(15,23,42,.04), 0 8px 24px rgba(15,23,42,.05);
  transition:box-shadow .22s ease, transform .22s ease, border-color .22s ease;
}
.oc-cardwrap:hover .oc-card{
  box-shadow:0 2px 4px rgba(15,23,42,.06), 0 14px 34px rgba(15,23,42,.10);
  transform:translateY(-2px);
}
.oc-card--dark{ background:#fff; }
.oc-card--locked{ background:#f4f6f9; border-style:dashed; }

.oc-card-body{ text-align:center; }
.oc-card-open{
  display:block; width:100%; border:none; background:none; cursor:pointer;
  padding:0; font:inherit; color:inherit;
}
.oc-card-open:disabled{ cursor:default; }
.oc-name{ font-size:15px; font-weight:700; letter-spacing:-.01em; margin:0; line-height:1.2; }
.oc-role{ font-size:12.5px; color:#94a3b8; margin:3px 0 0; line-height:1.3; }
.oc-dept{ display:inline-block; margin-top:6px; font-size:10.5px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; }

/* Department filter dimming + search highlight */
.oc-cardwrap{ transition:opacity .25s ease; }
.oc-cardwrap.is-dimmed{ opacity:.32; }
.oc-cardwrap.is-highlight .oc-card{
  border-color:#facc15;
  box-shadow:0 0 0 3px rgba(250,204,21,.45), 0 8px 24px rgba(15,23,42,.08);
}
.oc-cardwrap.is-focused .oc-card{
  border-color:#2563eb;
  box-shadow:0 0 0 3px rgba(37,99,235,.35), 0 8px 24px rgba(15,23,42,.10);
}

/* Locked placeholder */
.oc-skeleton{ height:10px; border-radius:6px; background:#e2e8f0; margin:0 auto; }
.oc-skeleton--name{ width:60%; height:12px; }
.oc-skeleton--role{ width:42%; margin-top:8px; }
.oc-lock{ color:#94a3b8; display:flex; justify-content:center; margin:8px 0; }

/* Count pill straddling the bottom edge */
.oc-pill{
  position:absolute; bottom:-15px; left:50%; transform:translateX(-50%);
  display:inline-flex; align-items:center; gap:5px;
  padding:6px 12px; border-radius:999px;
  font-size:13px; font-weight:600; cursor:pointer; border:none;
  box-shadow:0 2px 6px rgba(15,23,42,.18);
  transition:transform .15s ease, background .18s ease, box-shadow .18s ease;
}
.oc-pill:hover{ transform:translateX(-50%) translateY(-1px); }
.oc-pill:active{ transform:translateX(-50%) scale(.94); }
.oc-pill--dark{ background:#0f172a; color:#fff; }
.oc-pill--dark:hover{ background:#1e293b; }
.oc-pill--light{ background:#e8edf2; color:#475569; }
.oc-pill--light:hover{ background:#dbe3ea; }
.oc-pill-chev{ display:flex; transition:transform .25s ease; }

/* Children container — animated expand/collapse */
.oc-children{
  width:100%;
  display:grid;
  grid-template-rows:0fr;
  opacity:0;
  transition:grid-template-rows .34s ease, opacity .28s ease, margin .34s ease;
  margin-top:0;
}
.oc-children.is-open{
  grid-template-rows:1fr;
  opacity:1;
  margin-top:28px;
  margin-bottom:40px;
  background:#f5f5f6;
  border-radius:8px;
}
/* The grid-rows height animation only shows if the content is CLIPPED while
   the row resizes. So:
   - Collapsed/collapsing: overflow hidden IMMEDIATELY (no delay) — content
     clips as the row shrinks, so the collapse animates visibly.
   - Open: overflow becomes visible only AFTER the grow finishes (delayed),
     so pills/avatars aren't clipped in the steady state but the expand still
     animates cleanly. */
.oc-children-inner{ overflow:hidden; min-height:0; transition:overflow 0s; }
.oc-children.is-open > .oc-children-inner{ overflow:visible; padding-bottom:24px; transition:overflow 0s linear .34s; }

/* Brace header */
.oc-brace{
  background:#fff; border-radius:8px 8px 0 0;
  padding:12px 16px; margin-bottom:20px;
  border-bottom:1px solid #d1d5db;
}
.oc-brace-bar{
  display:flex; align-items:center; justify-content:space-between;
}
.oc-brace-parent{
  display:flex; align-items:center; gap:10px; min-width:0;
  border:none; background:none; cursor:pointer; padding:0; text-align:left;
}
.oc-brace-parent:hover .oc-brace-name{ text-decoration:underline; }
.oc-brace-dot{
  width:30px; height:30px; border-radius:999px; flex:none;
  display:grid; place-items:center;
  background:#1a1a1a; color:#fff; font-size:10px; font-weight:700;
}
.oc-brace-name{ font-size:14px; font-weight:600; color:#0f172a;
  white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:46vw; }
.oc-collapse{
  display:inline-flex; align-items:center; gap:4px;
  background:none; border:none; cursor:pointer;
  font-size:13.5px; font-weight:600; color:#475569; padding:4px 6px; border-radius:8px;
  transition:color .18s ease, background .18s ease;
}
.oc-collapse:hover{ color:#0f172a; background:#eef2f7; }

/* Column count and centering are set inline from JS */
.oc-grid{
  display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:18px 14px;
  align-items:start; justify-items:center;
  padding:0 52px;
}
.oc-grid-cell{
  width:100%; min-width:0;
  animation:oc-rise .4s ease both;
  animation-delay:calc(var(--i) * 40ms);
}
/* An expanded child's reports break out to span the full width, then lay out
   as their own two-column grid at this same level. */
.oc-grid-span{
  grid-column:1 / -1;
  min-width:0;
}
.oc-children:not(.is-open) .oc-grid-cell{ animation:none; }

@keyframes oc-rise{
  from{ opacity:0; transform:translateY(10px); }
  to{ opacity:1; transform:translateY(0); }
}

@media (max-width:380px){
  .oc-brace-name{ max-width:40vw; }
}

/* ---- Medium (768px) ---- */
@media (min-width:768px){
  .oc-header-inner,
  .oc-search-wrap,
  .oc-search-toolbar,
  .oc-crumbbar-inner{ max-width:900px; }
  .oc-main{ max-width:900px; }
  .oc-panel{ width:400px; }
  .oc-brace-name{ max-width:32vw; }
}

/* ---- Large (1024px) ---- */
@media (min-width:1024px){
  .oc-header-inner,
  .oc-search-wrap,
  .oc-search-toolbar,
  .oc-crumbbar-inner{ max-width:1200px; }
  .oc-header-inner{ padding:14px 24px 10px; }
  .oc-search-wrap{ padding:0 24px 10px; }
  .oc-search-toolbar{ padding:0 24px 12px; }
  .oc-crumbbar-inner{ padding:8px 24px; }
  .oc-main{ max-width:1200px; padding:40px 24px 80px; }
  .oc-panel{ width:440px; }
  .oc-brace-name{ max-width:none; }
  .oc-card{ padding:34px 20px 26px; }
}

/* ---- Extra-large (1280px) ---- */
@media (min-width:1280px){
  .oc-header-inner,
  .oc-search-wrap,
  .oc-search-toolbar,
  .oc-crumbbar-inner{ max-width:1440px; }
  .oc-header-inner{ padding:16px 32px 12px; }
  .oc-search-wrap{ padding:0 32px 12px; }
  .oc-search-toolbar{ padding:0 32px 14px; }
  .oc-crumbbar-inner{ padding:9px 32px; }
  .oc-main{ max-width:1440px; padding:48px 32px 100px; }
  .oc-grid{ gap:22px 18px; }
  .oc-title{ font-size:20px; }
}
`;
