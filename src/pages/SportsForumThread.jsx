import React from "react";
import { base44 } from "@/api/base44Client";
import ForumThreadView from "@/components/sports/ForumThreadView";

export default function SportsForumThread() {
  const [user, setUser] = React.useState(null);
  React.useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);
  if (!user) return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading…</div>;
  return <ForumThreadView user={user} />;
}