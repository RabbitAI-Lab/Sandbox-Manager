import type { ReactNode } from "react";

interface K8sModeCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  features: string[];
  onClick: () => void;
}

export function K8sModeCard({ icon, title, description, features, onClick }: K8sModeCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 text-left bg-white rounded-xl border-2 border-gray-200 p-6 hover:border-blue-400 hover:shadow-md focus:border-blue-500 focus:ring-2 focus:ring-blue-200 focus:outline-none transition-all group"
    >
      <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 mb-4 group-hover:bg-blue-100 transition-colors">
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 mb-4">{description}</p>
      <ul className="space-y-1.5">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
            <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {f}
          </li>
        ))}
      </ul>
    </button>
  );
}
