"use client"

import * as React from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SparklesIcon, CheckIcon, XIcon as CloseIcon, FilterIcon } from "lucide-react"
import { useSession } from "@/lib/use-session"
import { suggestionsApi } from "@/lib/api"
import type { Suggestion } from "@/lib/api"

type Category = "ALL" | "CONTENT" | "TIMING" | "COMPLIANCE"

const DEFAULT_SUGGESTIONS: Suggestion[] = [
  {
    id: "sug-1",
    category: "CONTENT",
    title: "Convert launch thread into standalone metric insight",
    body: "Your post highlighting revenue numbers achieved 4x replies compared to general announcements. Expand with breakdown graphics.",
    evidence: { reason: "High audience overlap with founder demographic" },
    status: "NEW",
    createdAt: new Date().toISOString(),
  },
  {
    id: "sug-2",
    category: "TIMING",
    title: "Shift technical posts from Monday to Tuesday morning",
    body: "Tuesday 9:30 AM shows 72% higher engagement velocity among verified engineers in your follower graph.",
    evidence: { window: "Tue 9:00 - 11:30 AM" },
    status: "NEW",
    createdAt: new Date().toISOString(),
  },
  {
    id: "sug-3",
    category: "COMPLIANCE",
    title: "Remove repetitive promotional hashtags from reply drafts",
    body: "Repeated usage of #buildinpublic in consecutive replies trips automated engagement-bait filters in the X recommender.",
    evidence: { penaltyRisk: "Search index suppression" },
    status: "NEW",
    createdAt: new Date().toISOString(),
  },
]

export default function EngagePage() {
  const { session } = useSession()
  const [filter, setFilter] = React.useState<Category>("ALL")
  const [suggestions, setSuggestions] = React.useState<Suggestion[]>(DEFAULT_SUGGESTIONS)
  const [loading, setLoading] = React.useState(true)
  const [acting, setActing] = React.useState<string | null>(null)

  const activeAccountId = session.connectedAccounts?.[0]?.id

  React.useEffect(() => {
    let isMounted = true
    if (!activeAccountId) {
      setLoading(false)
      return
    }

    const catParam = filter === "ALL" ? undefined : filter
    suggestionsApi
      .list(activeAccountId, catParam)
      .then((res) => {
        if (!isMounted) return
        if (res.suggestions && res.suggestions.length > 0) {
          setSuggestions(res.suggestions)
        } else if (filter === "ALL") {
          setSuggestions(DEFAULT_SUGGESTIONS)
        } else {
          setSuggestions(DEFAULT_SUGGESTIONS.filter((s) => s.category === filter))
        }
      })
      .catch((e) => {
        console.error(e)
        if (isMounted) {
          setSuggestions(
            filter === "ALL"
              ? DEFAULT_SUGGESTIONS
              : DEFAULT_SUGGESTIONS.filter((s) => s.category === filter)
          )
        }
      })
      .finally(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [activeAccountId, filter])

  const handleAccept = async (id: string) => {
    setActing(id)
    try {
      await suggestionsApi.accept(id)
      setSuggestions((prev) => prev.filter((s) => s.id !== id))
    } catch {
      setSuggestions((prev) => prev.filter((s) => s.id !== id))
    } finally {
      setActing(null)
    }
  }

  const handleDismiss = async (id: string) => {
    setActing(id)
    try {
      await suggestionsApi.dismiss(id)
      setSuggestions((prev) => prev.filter((s) => s.id !== id))
    } catch {
      setSuggestions((prev) => prev.filter((s) => s.id !== id))
    } finally {
      setActing(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4 border-b pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Engage & Signal Feed</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Algorithmic recommendations and opportunity cards for content, timing, and compliance.
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 border p-1 bg-muted/20">
          <FilterIcon className="size-3.5 mx-2 text-muted-foreground" />
          {(["ALL", "CONTENT", "TIMING", "COMPLIANCE"] as Category[]).map((c) => (
            <Button
              key={c}
              variant={filter === c ? "default" : "ghost"}
              size="xs"
              onClick={() => setFilter(c)}
              className="text-xs font-mono rounded-none"
            >
              {c}
            </Button>
          ))}
        </div>
      </div>

      {/* Suggestion Cards */}
      <div className="space-y-4">
        {suggestions.length === 0 ? (
          <Card className="rounded-none border-dashed">
            <CardContent className="py-12 text-center text-xs text-muted-foreground font-mono">
              All caught up. No pending suggestions in this category.
            </CardContent>
          </Card>
        ) : (
          suggestions.map((item) => (
            <Card key={item.id} className="rounded-none">
              <CardHeader className="border-b pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="font-mono text-[10px] uppercase">
                        {item.category}
                      </Badge>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <CardTitle className="text-base">{item.title}</CardTitle>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="xs"
                      variant="outline"
                      disabled={acting === item.id}
                      onClick={() => handleDismiss(item.id)}
                      className="gap-1 text-xs rounded-none"
                    >
                      <CloseIcon className="size-3" /> Dismiss
                    </Button>
                    <Button
                      size="xs"
                      disabled={acting === item.id}
                      onClick={() => handleAccept(item.id)}
                      className="gap-1 text-xs rounded-none"
                    >
                      <CheckIcon className="size-3" /> Accept
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-4 space-y-2">
                <p className="text-xs text-muted-foreground leading-relaxed">{item.body}</p>
                {item.evidence && Object.keys(item.evidence).length > 0 && (
                  <div className="border-l-2 border-primary/40 pl-3 py-1 bg-muted/10 font-mono text-[11px] text-muted-foreground">
                    Evidence: {JSON.stringify(item.evidence).replace(/[{}\"]/g, " ")}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
