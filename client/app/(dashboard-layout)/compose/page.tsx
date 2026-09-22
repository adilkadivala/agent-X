"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/use-session";
import { draftsApi } from "@/lib/api";
import type { Draft } from "@/lib/api";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sparkles, PenLine, CheckCircle2, Clock, Send, Plus, X
} from "lucide-react";

const STATUS_BADGE: Record<string, string> = {
  DRAFT: "bg-muted text-muted-foreground",
  SCHEDULED: "bg-blue-500/10 text-blue-700",
  PUBLISHED: "bg-emerald-500/10 text-emerald-700",
  FAILED: "bg-red-500/10 text-red-700",
};

export default function ComposePage() {
  const { session } = useSession();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [body, setBody] = useState("");
  const [kind, setKind] = useState<"ORIGINAL" | "REPLY" | "QUOTE">("ORIGINAL");
  const [creating, setCreating] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const firstAccount = session.connectedAccounts?.[0];

  const load = () => {
    if (!firstAccount?.id) { setLoading(false); return; }
    draftsApi.queue(firstAccount.id)
      .then((r) => setDrafts(r.drafts))
      .catch(() => null)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [firstAccount?.id]);

  const handleCreate = async () => {
    if (!body.trim() || !firstAccount?.id) return;
    setCreating(true);
    try {
      await draftsApi.create(firstAccount.id, body.trim(), kind);
      setBody("");
      setShowComposer(false);
      await load();
    } catch { /* noop */ } finally { setCreating(false); }
  };

  const handleApprove = async (id: string) => {
    setActing(id);
    try {
      await draftsApi.approve(id);
      setDrafts((prev) => prev.map((d) => d.id === id ? { ...d, status: "SCHEDULED" as const } : d));
    } catch { /* noop */ } finally { setActing(null); }
  };

  const handlePublish = async (id: string) => {
    setActing(id);
    try {
      await draftsApi.publish(id);
      setDrafts((prev) => prev.map((d) => d.id === id ? { ...d, status: "PUBLISHED" as const } : d));
    } catch { /* noop */ } finally { setActing(null); }
  };

  const charCount = body.length;

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Compose</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Draft, approve, and schedule. Nothing is published without your explicit approval.
          </p>
        </div>
        <Button onClick={() => { setShowComposer(true); setTimeout(() => textareaRef.current?.focus(), 100); }} className="gap-2">
          <Plus className="size-4" />
          New draft
        </Button>
      </div>

      {!firstAccount && (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center">
            <PenLine className="mx-auto size-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Connect your X account to create and manage drafts.</p>
          </CardContent>
        </Card>
      )}

      {/* Composer */}
      {firstAccount && showComposer && (
        <Card className="ring-1 ring-primary/20 shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <span className="font-semibold">New draft</span>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setShowComposer(false)}>
              <X className="size-4" />
            </Button>
          </CardHeader>
          <Separator />
          <CardContent className="pt-4 space-y-4">
            <Textarea
              ref={textareaRef}
              placeholder="What do you want to say?"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="min-h-28 resize-none text-sm"
              maxLength={280}
            />
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
                  <SelectTrigger className="h-8 w-28 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ORIGINAL">Original</SelectItem>
                    <SelectItem value="REPLY">Reply</SelectItem>
                    <SelectItem value="QUOTE">Quote</SelectItem>
                  </SelectContent>
                </Select>
                <span className={`text-xs ${charCount > 260 ? "text-destructive" : "text-muted-foreground"}`}>
                  {charCount}/280
                </span>
              </div>
              <Button onClick={handleCreate} disabled={creating || !body.trim()} className="gap-2">
                <PenLine className="size-4" />
                {creating ? "Saving…" : "Save draft"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Draft queue */}
      {firstAccount && (
        <div>
          <h2 className="mb-3 font-semibold">Draft queue ({drafts.filter(d => d.status !== "PUBLISHED").length})</h2>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
            </div>
          ) : drafts.filter(d => d.status !== "PUBLISHED").length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-12 text-center">
                <Sparkles className="mx-auto size-8 text-muted-foreground mb-2" />
                <p className="text-sm text-muted-foreground">No drafts in queue. Create one above.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {drafts.filter(d => d.status !== "PUBLISHED").map((draft) => (
                <Card key={draft.id}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                          <Badge className={STATUS_BADGE[draft.status] ?? ""}>{draft.status}</Badge>
                          <Badge variant="outline" className="text-xs">{draft.kind}</Badge>
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <Clock className="size-3" />
                            {new Date(draft.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-sm leading-relaxed">{draft.body}</p>
                        {draft.opportunity && (
                          <p className="mt-2 text-xs text-muted-foreground border-l-2 pl-2">
                            Re: @{draft.opportunity.sourceHandle}
                          </p>
                        )}
                      </div>
                      <div className="flex gap-2 shrink-0">
                        {draft.status === "DRAFT" && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={acting === draft.id}
                            onClick={() => handleApprove(draft.id)}
                            className="gap-1 text-xs"
                          >
                            <CheckCircle2 className="size-3" /> Approve
                          </Button>
                        )}
                        {draft.status === "SCHEDULED" && (
                          <Button
                            size="sm"
                            disabled={acting === draft.id}
                            onClick={() => handlePublish(draft.id)}
                            className="gap-1 text-xs"
                          >
                            <Send className="size-3" /> Publish
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
