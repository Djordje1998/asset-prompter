import { useRef, useState } from "react";
import type { ProjectSummary } from "../shared/types";
import { useDismiss } from "./hooks";
import { t } from "./i18n";
import { Icon } from "./icons";
import { humanTurn } from "./lib";

/** The project switcher in the top bar. */
export function ProjectMenu({
  projects,
  project,
  onChoose,
  onAdd,
  onDelete,
  trashed,
  onTrash,
}: {
  projects: ProjectSummary[];
  project: ProjectSummary | null;
  onChoose: (id: string) => void;
  onAdd: () => void;
  onDelete: (project: ProjectSummary) => void;
  /** Projects in projects/_trash. */
  trashed: number;
  onTrash: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const currentId = project?.id ?? null;
  return (
    <div className="workspace" ref={ref}>
      <button
        className="btn workspace-button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={project ? t("Project: {name}. Switch project", { name: project.name }) : t("Choose a project")}
      >
        <Icon name="folder" className="workspace-icon" />
        <span className="workspace-text">
          <span className="workspace-label">{t("Project")}</span>
          <span className="workspace-name">
            {project ? project.name : t("None yet")}
            {project && project.listening > 0 && <span className="agent-lamp" title={t("An agent is waiting on this project")} />}
          </span>
        </span>
        <Icon name="caret" size={10} className={`workspace-caret${open ? " is-open" : ""}`} />
      </button>
      {open && (
        <div className="menu" role="menu" aria-label={t("Projects")}>
          {projects.map((p) => (
            <button
              key={p.id}
              className={`menu-item${p.id === currentId ? " is-current" : ""}`}
              onClick={() => {
                setOpen(false);
                onChoose(p.id);
              }}
              role="menuitemradio"
              aria-checked={p.id === currentId}
              aria-label={[
                p.name,
                humanTurn(p.counts) > 0 ? t("{n} waiting for you", { n: humanTurn(p.counts) }) : null,
                p.listening > 0 ? t("agent waiting") : null,
                p.external ? p.path : null,
              ]
                .filter(Boolean)
                .join(", ")}
            >
              <span className="menu-mark">{p.id === currentId && <Icon name="check" size={12} />}</span>
              <span className="menu-name">{p.name}</span>
              {p.listening > 0 && <span className="agent-lamp" title={t("An agent is waiting on this project")} />}
              {p.external && (
                <span className="menu-path" title={p.path}>
                  {p.path}
                </span>
              )}
              {humanTurn(p.counts) > 0 && <span className="badge">{humanTurn(p.counts)}</span>}
            </button>
          ))}
          <button
            className="menu-item menu-add"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onAdd();
            }}
          >
            {t("Add a project")}
          </button>
          {trashed > 0 && (
            <button
              className="menu-item menu-trash"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onTrash();
              }}
            >
              <Icon name="trash" size={12} />
              {t("Deleted projects")}
              <span className="badge badge-quiet">{trashed}</span>
            </button>
          )}
          {project && (
            <button
              className="menu-item menu-delete"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onDelete(project);
              }}
            >
              <Icon name="trash" size={12} />
              {project.external ? t("Remove {name} from the list", { name: project.name }) : t("Delete {name}", { name: project.name })}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
