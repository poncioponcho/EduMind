export function AppSkeleton() {
  return (
    <div className="min-h-screen bg-background animate-pulse">
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-secondary" />
            <div className="w-20 h-5 rounded bg-secondary" />
          </div>
          <div className="flex items-center gap-4">
            <div className="w-16 h-5 rounded bg-secondary" />
            <div className="w-16 h-5 rounded bg-secondary" />
            <div className="w-16 h-5 rounded bg-secondary" />
            <div className="w-7 h-7 rounded-full bg-secondary" />
          </div>
        </div>
      </nav>
      <main className="pt-14">
        <div className="max-w-7xl mx-auto px-4 py-12 space-y-8">
          <div className="text-center space-y-4">
            <div className="h-12 w-96 mx-auto rounded-lg bg-secondary" />
            <div className="h-6 w-64 mx-auto rounded bg-secondary" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 rounded-xl bg-secondary" />
            ))}
          </div>
          <div className="h-64 rounded-xl bg-secondary" />
        </div>
      </main>
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="bg-card border border-border rounded-lg p-4 space-y-3 animate-pulse">
      <div className="h-4 w-24 rounded bg-secondary" />
      <div className="h-8 w-16 rounded bg-secondary" />
      <div className="h-3 w-32 rounded bg-secondary" />
    </div>
  );
}

export function ChatSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="flex gap-2">
        <div className="w-8 h-8 rounded-full bg-secondary shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-3 w-3/4 rounded bg-secondary" />
          <div className="h-3 w-1/2 rounded bg-secondary" />
        </div>
      </div>
      <div className="flex gap-2 justify-end">
        <div className="flex-1 max-w-xs space-y-2">
          <div className="h-3 w-full rounded bg-secondary" />
          <div className="h-3 w-2/3 rounded bg-secondary" />
        </div>
      </div>
    </div>
  );
}
