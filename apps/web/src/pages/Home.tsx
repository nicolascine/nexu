import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, Star, GitFork, Clock, TrendingUp, Code2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CodeThemeSelector } from "@/components/CodeThemeSelector";
import { cn } from "@/lib/utils";

interface Codebase {
  id: string;
  name: string;
  description: string;
  owner: string;
  stars: number;
  forks: number;
  language: string;
  lastIndexed: string;
  chunks: number;
  featured?: boolean;
}

const mockCodebases: Codebase[] = [
  {
    id: "calcom",
    name: "cal.com",
    description: "Scheduling infrastructure for absolutely everyone",
    owner: "calcom",
    stars: 28400,
    forks: 6200,
    language: "TypeScript",
    lastIndexed: "2h ago",
    chunks: 15234,
    featured: true,
  },
  {
    id: "shadcn-ui",
    name: "shadcn/ui",
    description: "Beautifully designed components built with Radix UI and Tailwind CSS",
    owner: "shadcn",
    stars: 52100,
    forks: 3100,
    language: "TypeScript",
    lastIndexed: "4h ago",
    chunks: 8943,
    featured: true,
  },
  {
    id: "supabase",
    name: "supabase",
    description: "The open source Firebase alternative. Postgres database, Authentication, Storage, and more.",
    owner: "supabase",
    stars: 67800,
    forks: 6400,
    language: "TypeScript",
    lastIndexed: "6h ago",
    chunks: 32187,
    featured: true,
  },
  {
    id: "nextjs",
    name: "next.js",
    description: "The React Framework for Production",
    owner: "vercel",
    stars: 121500,
    forks: 26100,
    language: "JavaScript",
    lastIndexed: "1h ago",
    chunks: 28391,
  },
  {
    id: "astro",
    name: "astro",
    description: "The web framework for content-driven websites",
    owner: "withastro",
    stars: 43200,
    forks: 2300,
    language: "TypeScript",
    lastIndexed: "3h ago",
    chunks: 12456,
  },
  {
    id: "nuxt",
    name: "nuxt",
    description: "The Intuitive Vue Framework",
    owner: "nuxt",
    stars: 51800,
    forks: 4700,
    language: "TypeScript",
    lastIndexed: "5h ago",
    chunks: 18723,
  },
  {
    id: "remix",
    name: "remix",
    description: "Build Better Websites. Create modern, resilient user experiences with web fundamentals.",
    owner: "remix-run",
    stars: 27900,
    forks: 2400,
    language: "TypeScript",
    lastIndexed: "7h ago",
    chunks: 9834,
  },
  {
    id: "trpc",
    name: "trpc",
    description: "End-to-end typesafe APIs made easy",
    owner: "trpc",
    stars: 32400,
    forks: 1200,
    language: "TypeScript",
    lastIndexed: "8h ago",
    chunks: 6721,
  },
  {
    id: "prisma",
    name: "prisma",
    description: "Next-generation Node.js and TypeScript ORM",
    owner: "prisma",
    stars: 36900,
    forks: 1400,
    language: "TypeScript",
    lastIndexed: "4h ago",
    chunks: 24567,
  },
];

const Home = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "featured">("all");

  const filteredCodebases = mockCodebases.filter((codebase) => {
    const matchesSearch =
      codebase.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      codebase.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filter === "all" || (filter === "featured" && codebase.featured);
    return matchesSearch && matchesFilter;
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
          <Button
            variant={filter === "all" ? "default" : "ghost"}
            size="sm"
            className="text-xs sm:text-sm h-8 sm:h-9 px-2.5 sm:px-3"
            onClick={() => setFilter("all")}
          >
            All
          </Button>
          <Button
            variant={filter === "featured" ? "default" : "ghost"}
            size="sm"
            className="text-xs sm:text-sm h-8 sm:h-9 px-2.5 sm:px-3"
            onClick={() => setFilter("featured")}
          >
            Featured
          </Button>
        </div>
      </section>

      {/* Codebase Gallery */}
      <section className="container mx-auto px-3 sm:px-4 pb-16 sm:pb-24">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-6">
          {filteredCodebases.map((codebase) => (
            <Link key={codebase.id} to={`/chat/${codebase.id}`}>
              <Card
                className={cn(
                  "group relative h-full p-4 sm:p-6 transition-all hover:shadow-lg active:shadow-lg hover:border-primary/50 active:border-primary/50",
                  "cursor-pointer overflow-hidden"
                )}
              >
                {codebase.featured && (
                  <Badge className="absolute top-3 right-3 sm:top-4 sm:right-4 bg-primary/10 text-primary border-primary/20 text-[10px] sm:text-xs">
                    Featured
                  </Badge>
                )}

                <div className="space-y-3 sm:space-y-4">
                  <div>
                    <div className="flex items-start justify-between mb-1.5 sm:mb-2 pr-16 sm:pr-20">
                      <h3 className="text-sm sm:text-lg font-semibold group-hover:text-primary transition-colors truncate">
                        {codebase.owner}/{codebase.name}
                      </h3>
                    </div>
                    <p className="text-xs sm:text-sm text-muted-foreground line-clamp-2">
                      {codebase.description}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 sm:gap-4 text-[10px] sm:text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Star className="w-3 h-3" />
                      {(codebase.stars / 1000).toFixed(1)}k
                    </div>
                    <div className="flex items-center gap-1">
                      <GitFork className="w-3 h-3" />
                      {(codebase.forks / 1000).toFixed(1)}k
                    </div>
                    <div className="flex items-center gap-1">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-primary" />
                      {codebase.language}
                    </div>
                  </div>

                  <div className="pt-3 sm:pt-4 border-t border-border">
                    <div className="flex items-center justify-between text-[10px] sm:text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {codebase.lastIndexed}
                      </div>
                      <div>{codebase.chunks.toLocaleString()} chunks</div>
                    </div>
                  </div>
                </div>

                <div className="absolute inset-0 border-2 border-primary opacity-0 group-hover:opacity-100 transition-opacity rounded-lg pointer-events-none" />
              </Card>
            </Link>
          ))}
        </div>

        {filteredCodebases.length === 0 && (
          <div className="text-center py-12 sm:py-16">
            <p className="text-sm sm:text-base text-muted-foreground">No codebases found matching your search.</p>
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
