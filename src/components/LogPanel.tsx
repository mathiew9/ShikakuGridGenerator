import { useEffect, useRef, useState } from "react";
import { FaChevronLeft, FaChevronRight } from "react-icons/fa6";
import type { GeneratorLog } from "../types/rectangleTypes";

type Props = {
  logs: GeneratorLog[];
  defaultCollapsed?: boolean;
};

export function LogPanel({ logs, defaultCollapsed = false }: Props) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  const logEndRef = useRef<HTMLDivElement | null>(null);

  const handleToggleCollapse = () => {
    setIsCollapsed((currentValue) => !currentValue);
  };

  useEffect(() => {
    if (isCollapsed) {
      return;
    }

    logEndRef.current?.scrollIntoView({
      behavior: "auto",
      block: "end",
    });
  }, [logs, isCollapsed]);

  return (
    <section className={`logPanel ${isCollapsed ? "logPanelCollapsed" : ""}`}>
      <div className="logPanelHeader">
        {!isCollapsed && <h2>Logs</h2>}

        <button
          type="button"
          className="logCollapseButton"
          onClick={handleToggleCollapse}
          aria-label={
            isCollapsed
              ? "Déplier le panneau des logs"
              : "Replier le panneau des logs"
          }
          title={isCollapsed ? "Déplier les logs" : "Replier les logs"}
        >
          {isCollapsed ? <FaChevronLeft /> : <FaChevronRight />}
        </button>
      </div>

      {!isCollapsed && (
        <div className="logContainer">
          {logs.length === 0 && (
            <div className="logEmpty">Aucun log pour le moment</div>
          )}

          {logs.map((log) => (
            <div key={log.id} className={`logLine log-${log.level}`}>
              <span className="logTime">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>

              <span className="logMessage">{log.message}</span>
            </div>
          ))}

          <div ref={logEndRef} aria-hidden="true" />
        </div>
      )}
    </section>
  );
}
