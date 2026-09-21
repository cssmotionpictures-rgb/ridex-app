import React from "react";
import { base44 } from "@/api/base44Client";
import PageHeader from "@/components/shared/PageHeader";
import ForumList from "@/components/sports/ForumList";

export default function SportsForum() {
  const [user, setUser] = React.useState(null);
  React.useEffect(() => { base44.auth.me().then(setUser).catch(() => {}); }, []);
  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader eyebrow="Fan Forum" title="Football Fan Forum" subtitle="Discuss live matches, tactics, transfers and more with fellow fans." />
      <ForumList user={user} />
    </div>
  );
}