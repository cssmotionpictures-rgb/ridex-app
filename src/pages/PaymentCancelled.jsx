import React from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function PaymentCancelled() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md text-center space-y-5">
        <h1 className="text-2xl font-bold">Payment cancelled</h1>
        <p className="text-muted-foreground">No charge was made. You can try again anytime.</p>
        <Link to="/dashboard"><Button className="rounded-full">Back to dashboard</Button></Link>
      </div>
    </div>
  );
}