"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-semibold">Page not found</h1>
        <p className="text-muted-foreground">This page you are looking for could not be found.</p>
        <Button className="mx-auto mt-6">
          <Link href="/">Go back home</Link>
        </Button>
      </div>
    </div>
  );
}
