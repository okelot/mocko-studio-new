export function Icon({
  name,
  className = "h-4 w-4",
}: {
  name: "spark" | "plus" | "x" | "upload" | "trash" | "edit" | "chevron" | "logout" | "linkedin";
  className?: string;
}) {
  const paths = {
    spark: "M12 2l1.9 5.7L20 10l-6.1 2.3L12 18l-1.9-5.7L4 10l6.1-2.3L12 2z",
    plus: "M12 5v14M5 12h14",
    x: "M6 6l12 12M18 6L6 18",
    upload: "M12 16V4m0 0L7 9m5-5l5 5M5 20h14",
    trash: "M6 7h12M10 7V5h4v2m-6 3v8m4-8v8m4-8v8M8 7l1 14h6l1-14",
    edit: "M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4",
    chevron: "M9 18l6-6-6-6",
    logout: "M15 7l5 5-5 5M20 12H9M11 4H5v16h6",
    linkedin: "M6 9v10M6 5v.01M10 19v-10m0 4c0-2.2 1.4-4 3.8-4S18 10.7 18 14v5",
  };

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill={name === "spark" ? "currentColor" : "none"}
      stroke={name === "spark" ? "none" : "currentColor"}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
