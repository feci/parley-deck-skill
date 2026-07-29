import { ArrowUpIcon, ArrowDownIcon } from "@heroicons/react/24/solid";

// One package, one source. The specifier matches both the generic import shape and the
// Heroicons recogniser, and it is one source either way.
export function Toolbar() {
  return (
    <div className="toolbar">
      <button type="button">
        <ArrowUpIcon />
        Raise
      </button>
      <button type="button">
        <ArrowDownIcon />
        Lower
      </button>
    </div>
  );
}
