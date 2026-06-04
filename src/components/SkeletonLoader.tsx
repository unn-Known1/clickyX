/**
 * SkeletonLoader — pulsing placeholder components for loading states.
 * Usage:
 *   <SkeletonLine width="60%" height={14} />
 *   <SkeletonCard />
 */

export function SkeletonLine({
  width = "100%",
  height = 16,
}: {
  width?: string;
  height?: number;
}) {
  return (
    <div
      className="skeleton-line"
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="skeleton-card" aria-hidden="true">
      <SkeletonLine width="40%" height={18} />
      <SkeletonLine width="80%" height={14} />
      <SkeletonLine width="60%" height={14} />
    </div>
  );
}

export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}
