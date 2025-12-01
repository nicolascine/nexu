import { CodeThemeSelector } from "@/components/CodeThemeSelector";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getRepositories, getRepoSlug, type Repository } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Clock, Code2, Link2, Loader2, Search, Star, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

function formatTimeAgo(date: string): string {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  return "just now";
}

const Home = () => {
  const [searchQuery, setSearchQuery] = useState("");

  const { data, isLoading, error } = useQuery({
    queryKey: ["repositories"],
    queryFn: getRepositories,
  });

  const repositories = data?.repositories || [];

  const filteredCodebases = repositories.filter((repo) => {
    const matchesSearch =
      repo.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (repo.description?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false);
    return matchesSearch;
  });

  return (
    <div className="bg-background min-h-screen">
      {/* Header */}
      <header className="top-0 z-50 sticky bg-background/95 supports-[backdrop-filter]:bg-background/60 backdrop-blur border-border border-b">
        <div className="flex justify-between items-center mx-auto px-3 sm:px-4 h-14 sm:h-16 container">
          <div className="flex items-center gap-2">
            {/* <Link2 className="w-5 sm:w-6 h-5 sm:h-6 text-primary" /> */}
            <span className="font-semibold text-lg sm:text-xl">nexu</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <nav className="hidden md:flex items-center gap-6 text-sm">
              <a href="#explore" className="text-muted-foreground hover:text-foreground transition-colors">
                Explore
              </a>
            </nav>
            <CodeThemeSelector />
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto px-3 sm:px-4 py-10 sm:py-16 md:py-24 container">
        <div className="space-y-4 sm:space-y-6 mx-auto max-w-3xl text-center">
          <h1 className="font-bold text-3xl sm:text-4xl md:text-6xl tracking-tight">
            Chat with your{" "}
            <span className="text-primary">codebase</span>
          </h1>
          <p className="px-2 text-muted-foreground text-base sm:text-lg md:text-xl">
            Ask questions, explore dependencies, and understand code in seconds.
            Powered by AI and knowledge graphs.
          </p>

          {/* Search */}
          <div className="relative mx-auto mt-6 sm:mt-8 max-w-2xl">
            <Search className="top-1/2 left-3 sm:left-4 absolute w-4 sm:w-5 h-4 sm:h-5 text-muted-foreground -translate-y-1/2" />
            <Input
              type="text"
              placeholder="Search codebases..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 sm:pl-12 h-11 sm:h-12 text-sm sm:text-base"
            />
          </div>

          {/* Stats */}
          <div className="flex justify-center items-center gap-4 sm:gap-8 pt-6 sm:pt-8 text-xs sm:text-sm">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <Code2 className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">156K</span> files
              </span>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <TrendingUp className="w-3.5 sm:w-4 h-3.5 sm:h-4 text-muted-foreground" />
              <span className="text-muted-foreground">
                <span className="font-semibold text-foreground">2.3M</span> queries
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="mx-auto px-3 sm:px-4 pb-4 sm:pb-8 container">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Badge variant="secondary" className="text-xs sm:text-sm">
            {repositories.length} indexed {repositories.length === 1 ? "repository" : "repositories"}
          </Badge>
        </div>
      </section>

      {/* Codebase Gallery */}
      <section className="mx-auto px-3 sm:px-4 pb-16 sm:pb-24 container">
        {isLoading && (
          <div className="flex justify-center items-center py-12 sm:py-16">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            <span className="ml-2 text-muted-foreground text-sm">Loading repositories...</span>
          </div>
        )}

        {error && (
          <div className="py-12 sm:py-16 text-center">
            <p className="text-destructive text-sm sm:text-base">Failed to load repositories. Please try again.</p>
          </div>
        )}

        {!isLoading && !error && (
          <div className="gap-3 sm:gap-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {filteredCodebases.map((repo) => (
              <Link key={repo.id} to={`/chat/${getRepoSlug(repo.owner, repo.name)}`}>
                <Card
                  className={cn(
                    "group relative hover:shadow-lg active:shadow-lg p-4 sm:p-6 hover:border-primary/50 active:border-primary/50 h-full transition-all",
                    "cursor-pointer overflow-hidden"
                  )}
                >
                  {repo.status === "ready" && (
                    <Badge className="top-3 sm:top-4 right-3 sm:right-4 absolute bg-green-500/10 border-green-500/20 text-[10px] text-green-600 sm:text-xs">
                      Ready
                    </Badge>
                  )}

                  <div className="space-y-3 sm:space-y-4">
                    <div>
                      <div className="flex justify-between items-start mb-1.5 sm:mb-2 pr-16 sm:pr-20">
                        <h3 className="font-semibold group-hover:text-primary text-sm sm:text-lg truncate transition-colors">
                          {repo.fullName}
                        </h3>
                      </div>
                      <p className="text-muted-foreground text-xs sm:text-sm line-clamp-2">
                        {repo.description || "No description available"}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 sm:gap-4 text-[10px] text-muted-foreground sm:text-xs">
                      <div className="flex items-center gap-1">
                        <Star className="w-3 h-3" />
                        {repo.stars >= 1000 ? `${(repo.stars / 1000).toFixed(1)}k` : repo.stars}
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="bg-primary rounded-full w-1.5 sm:w-2 h-1.5 sm:h-2" />
                        {repo.language || "Unknown"}
                      </div>
                    </div>

                    <div className="pt-3 sm:pt-4 border-border border-t">
                      <div className="flex justify-between items-center text-[10px] text-muted-foreground sm:text-xs">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTimeAgo(repo.indexedAt)}
                        </div>
                        <div>{repo.chunkCount.toLocaleString()} chunks</div>
                      </div>
                    </div>
                  </div>

                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 border-2 border-primary rounded-lg transition-opacity pointer-events-none" />
                </Card>
              </Link>
            ))}
          </div>
        )}

        {!isLoading && !error && filteredCodebases.length === 0 && (
          <div className="py-12 sm:py-16 text-center">
            <p className="text-muted-foreground text-sm sm:text-base">
              {repositories.length === 0
                ? "No repositories indexed yet. Index a repository to get started."
                : "No codebases found matching your search."}
            </p>
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="py-8 sm:py-12 border-border border-t">
        <div className="mx-auto px-3 sm:px-4 container">
          <div className="flex md:flex-row flex-col justify-between items-center gap-4 text-muted-foreground text-xs sm:text-sm">
            <div className="flex items-center gap-2">
              <span>
                created by <a href="https://github.com/nicolascine" target="_blank" rel="noopener noreferrer" className="font-medium hover:text-foreground transition-colors">@nicolascine</a>
              </span>
              <span className="text-border">|</span>
              <span>MIT Licensed</span>
            </div>
            
            <div className="flex items-center gap-4">
              <a 
                href="https://github.com/nicolascine/nexu" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="flex items-center gap-2 hover:text-foreground transition-colors"
              >
                <Star className="w-4 h-4" />
                <span>Star on GitHub</span>
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
