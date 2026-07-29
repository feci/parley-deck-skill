import { Check } from "lucide-react";

export function FeatureList() {
  return (
    <ul className="feature-list">
      <li>
        <Check />
        Two glyphs from one library
      </li>
      <li>
        <i className="fa-solid fa-star" />
        One from another
      </li>
      <li>
        <span>🚀</span>
        And one the reader's platform draws
      </li>
    </ul>
  );
}
