import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search, Star, Clock, TrendingUp, Code2, Link2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CodeThemeSelector } from "@/components/CodeThemeSelector";
import { cn } from "@/lib/utils";
import { getRepositories, getRepoSlug, type Repository } from "@/lib/api";

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
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
            <span className="text-lg sm:text-xl font-semibold">nexu</span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <nav className="hidden md:flex items-center gap-6 text-sm">
              <a href="#explore" className="text-muted-foreground hover:text-foreground transition-colors">
                Explore
              </a>
              <a href="#trending" className="text-muted-foreground hover:text-foreground transition-colors">
                Trending
              </a>
              <a href="#docs" className="text-muted-foreground hover:text-foreground transition-colors">
                Docs
              </a>
            </nav>
            <CodeThemeSelector />
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-3 sm:px-4 py-10 sm:py-16 md:py-24">
        <div className="max-w-3xl mx-auto text-center space-y-4 sm:space-y-6">
          <h1 className="text-3xl sm:text-4xl md:text-6xl font-bold tracking-tight">
            Chat with any{" "}
            <span className="text-primary">codebase</span>
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground px-2">
            Ask questions, explore dependencies, and understand code in seconds.
            Powered by AI and knowledge graphs.
          </p>

          {/* Search */}
          <div className="relative max-w-2xl mx-auto mt-6 sm:mt-8">
            <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-4 sm:w-5 h-4 sm:h-5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search codebases..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 sm:pl-12 h-11 sm:h-12 text-sm sm:text-base"
            />
          </div>

          {/* Stats */}
          <div className="flex items-center justify-center gap-4 sm:gap-8 pt-6 sm:pt-8 text-xs sm:text-sm">
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
      <section className="container mx-auto px-3 sm:px-4 pb-4 sm:pb-8">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <Badge variant="secondary" className="text-xs sm:text-sm">
            {repositories.length} indexed {repositories.length === 1 ? "repository" : "repositories"}
          </Badge>
        </div>
      </section>

      {/* Codebase Gallery */}
      <section className="container mx-auto px-3 sm:px-4 pb-16 sm:pb-24">
        {isLoading && (
          <div className="flex items-center justify-center py-12 sm:py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="ml-2 text-sm text-muted-foreground">Loading repositories...</span>
          </div>
        )}

        {error && (
          <div className="text-center py-12 sm:py-16">
            <p className="text-sm sm:text-base text-destructive">Failed to load repositories. Please try again.</p>
          </div>
        )}

        {!isLoading && !error && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
            {filteredCodebases.map((repo) => (
              <Link key={repo.id} to={`/chat/${getRepoSlug(repo.owner, repo.name)}`}>
                <Card
                  className={cn(
                    "group relative h-full p-4 sm:p-6 transition-all hover:shadow-lg active:shadow-lg hover:border-primary/50 active:border-primary/50",
                    "cursor-pointer overflow-hidden"
                  )}
                >
                  {repo.status === "ready" && (
                    <Badge className="absolute top-3 right-3 sm:top-4 sm:right-4 bg-green-500/10 text-green-600 border-green-500/20 text-[10px] sm:text-xs">
                      Ready
                    </Badge>
                  )}

                  <div className="space-y-3 sm:space-y-4">
                    <div>
                      <div className="flex items-start justify-between mb-1.5 sm:mb-2 pr-16 sm:pr-20">
                        <h3 className="text-sm sm:text-lg font-semibold group-hover:text-primary transition-colors truncate">
                          {repo.fullName}
                        </h3>
                      </div>
                      <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                        {repo.description || "No description available"}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 sm:gap-4 text-[10px] sm:text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Star className="w-3 h-3" />
                        {repo.stars >= 1000 ? `${(repo.stars / 1000).toFixed(1)}k` : repo.stars}
                      </div>
                      <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-primary" />
                        {repo.language || "Unknown"}
                      </div>
                    </div>

                    <div className="pt-3 sm:pt-4 border-t border-border">
                      <div className="flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatTimeAgo(repo.indexedAt)}
                        </div>
                        <div>{repo.chunkCount.toLocaleString()} chunks</div>
                      </div>
                    </div>
                  </div>

                  <div className="absolute inset-0 border-2 border-primary opacity-0 group-hover:opacity-100 transition-opacity rounded-lg pointer-events-none" />
                </Card>
              </Link>
            ))}
          </div>
        )}

        {!isLoading && !error && filteredCodebases.length === 0 && (
          <div className="text-center py-12 sm:py-16">
            <p className="text-sm sm:text-base text-muted-foreground">
              {repositories.length === 0
                ? "No repositories indexed yet. Index a repository to get started."
                : "No codebases found matching your search."}
            </p>
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-8 sm:py-12">
        <div className="container mx-auto px-3 sm:px-4">
          <div className="flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-4">
            <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
              <Link2 className="w-3.5 sm:w-4 h-3.5 sm:h-4" />
              <span>nexu - Chat with code</span>
            </div>
            <div className="flex items-center gap-4 sm:gap-6 text-xs sm:text-sm text-muted-foreground">
              <a href="#" className="hover:text-foreground active:text-foreground transition-colors">
                GitHub
              </a>
              <a href="#" className="hover:text-foreground active:text-foreground transition-colors">
                Docs
              </a>
              <a href="#" className="hover:text-foreground active:text-foreground transition-colors">
                API
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Home;
