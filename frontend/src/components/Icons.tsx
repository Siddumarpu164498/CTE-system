import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function Base({ title, children, ...rest }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      width="1em"
      height="1em"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const CheckCircleIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="10" cy="10" r="7.5" />
    <path d="M6.5 10.2l2.4 2.4 4.6-5" />
  </Base>
);

export const XOctagonIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M7 2.5h6l4.5 4.5v6L13 17.5H7L2.5 13V7z" />
    <path d="M7.5 7.5l5 5M12.5 7.5l-5 5" />
  </Base>
);

export const AlertTriangleIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M10 2.8L18 16.5H2z" />
    <path d="M10 8v3.8M10 14.2v.1" />
  </Base>
);

export const QuestionIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="2.5" y="2.5" width="15" height="15" rx="3" />
    <path d="M7.8 7.6a2.3 2.3 0 114 1.6c-.8.6-1.8 1-1.8 2.2M10 14.2v.1" />
  </Base>
);

export const MinusCircleIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="10" cy="10" r="7.5" />
    <path d="M6.5 10h7" />
  </Base>
);

export const ClockIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="10" cy="10" r="7.5" />
    <path d="M10 6v4l2.5 2" />
  </Base>
);

export const SpinnerIcon = ({ className, ...p }: IconProps) => (
  <Base {...p} className={`animate-spin ${className ?? ""}`}>
    <path d="M10 2.5a7.5 7.5 0 107.5 7.5" />
  </Base>
);

export const ShieldIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M10 2.5l6 2.2v4.6c0 3.8-2.6 6.6-6 8.2-3.4-1.6-6-4.4-6-8.2V4.7z" />
    <path d="M10 6.5v4M10 13v.1" />
  </Base>
);

export const FileIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M11.5 2.5H5.5a1 1 0 00-1 1v13a1 1 0 001 1h9a1 1 0 001-1V6.5z" />
    <path d="M11.5 2.5v4h4" />
  </Base>
);

export const UploadIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M10 13V3.5M6.5 7L10 3.5 13.5 7" />
    <path d="M3.5 13v2.5a1 1 0 001 1h11a1 1 0 001-1V13" />
  </Base>
);

export const MenuIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M3 5.5h14M3 10h14M3 14.5h14" />
  </Base>
);

export const CloseIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M5 5l10 10M15 5L5 15" />
  </Base>
);

export const ChevronIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M7.5 5l5 5-5 5" />
  </Base>
);

export const PlusIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M10 4v12M4 10h12" />
  </Base>
);

export const SunIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="10" cy="10" r="3.2" />
    <path d="M10 2.5v1.8M10 15.7v1.8M2.5 10h1.8M15.7 10h1.8M4.7 4.7l1.3 1.3M14 14l1.3 1.3M4.7 15.3L6 14M14 6l1.3-1.3" />
  </Base>
);

export const MoonIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M16 12.2A6.5 6.5 0 017.8 4a6.5 6.5 0 108.2 8.2z" />
  </Base>
);

export const MonitorIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="2.5" y="3.5" width="15" height="10" rx="1.5" />
    <path d="M7 17h6M10 13.5V17" />
  </Base>
);

export const UsersIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="7.5" cy="7" r="2.8" />
    <path d="M2.5 16.5c.6-2.6 2.6-4 5-4s4.4 1.4 5 4" />
    <path d="M13 4.6a2.8 2.8 0 010 5M14.8 12.8c1.3.6 2.3 1.8 2.7 3.7" />
  </Base>
);

export const ActivityIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M2.5 10h3l2-5 3.5 10 2-5h4.5" />
  </Base>
);

export const SparklesIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M8 3l1.4 3.6L13 8l-3.6 1.4L8 13l-1.4-3.6L3 8l3.6-1.4z" />
    <path d="M14.5 12l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
  </Base>
);

export const SearchIcon = (p: IconProps) => (
  <Base {...p}>
    <circle cx="8.8" cy="8.8" r="5.3" />
    <path d="M12.8 12.8l4 4" />
  </Base>
);

export const LogoutIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M8 4H5a1.5 1.5 0 00-1.5 1.5v9A1.5 1.5 0 005 16h3" />
    <path d="M12.5 13.5L16 10l-3.5-3.5M16 10H8" />
  </Base>
);

export const GridIcon = (p: IconProps) => (
  <Base {...p}>
    <rect x="3" y="3" width="5.5" height="5.5" rx="1" />
    <rect x="11.5" y="3" width="5.5" height="5.5" rx="1" />
    <rect x="3" y="11.5" width="5.5" height="5.5" rx="1" />
    <rect x="11.5" y="11.5" width="5.5" height="5.5" rx="1" />
  </Base>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Base {...p}>
    <path d="M4 10h12M11.5 5.5L16 10l-4.5 4.5" />
  </Base>
);
