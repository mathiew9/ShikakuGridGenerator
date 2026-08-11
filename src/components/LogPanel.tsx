import { useEffect, useRef } from "react";
import { FaChevronDown, FaChevronUp } from "react-icons/fa6";
import type { GeneratorLog } from "../types/rectangleTypes";

type Props = {
  logs: GeneratorLog[];
  isCollapsed: boolean;
  onToggleCollapse: () => void;
};

export function LogPanel({ logs, isCollapsed, onToggleCollapse }: Props) {
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({
      behavior: "auto",
      block: "end",
    });
  }, [logs, isCollapsed]);

  return (
    <section
      className={`logPanel ${
        isCollapsed ? "logPanelCollapsed" : "logPanelExpanded"
      }`}
    >
      <div className="logPanelControls">
        <span className="logPanelLabel">Logs</span>

        <button
          type="button"
          className="logCollapseButton"
          onClick={onToggleCollapse}
          aria-label={isCollapsed ? "Déplier les logs" : "Replier les logs"}
          title={isCollapsed ? "Déplier les logs" : "Replier les logs"}
        >
          {isCollapsed ? <FaChevronDown /> : <FaChevronUp />}
        </button>
      </div>

      <div className="logContainer">
        {logs.length === 0 ? (
          <div className="logEmpty">Aucun log pour le moment</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className={`logLine log-${log.level}`}>
              <span className="logTime">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>

              <span className="logMessage">{log.message}</span>
            </div>
          ))
        )}

        <div ref={logEndRef} aria-hidden="true" />
      </div>
    </section>
  );
}
