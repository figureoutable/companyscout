"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserSearch } from "lucide-react";

export interface DirectorSearchPanelProps {
  onSearch: (directorName: string) => void;
  isSearching: boolean;
}

export function DirectorSearchPanel({ onSearch, isSearching }: DirectorSearchPanelProps) {
  const [name, setName] = React.useState("");

  const submit = () => {
    onSearch(name);
  };

  return (
    <Card className="w-full border-border/80 shadow-sm dark:border-border/50">
      <CardHeader className="space-y-1 pb-4">
        <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <UserSearch className="size-4 shrink-0 text-muted-foreground" />
          Director Search
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Exact full-name search using live Companies House officer data. Active directorships only.
        </p>
      </CardHeader>
      <CardContent className="space-y-5 pt-0">
        <div className="space-y-2">
          <Label htmlFor="director-name">Director full name</Label>
          <Input
            id="director-name"
            placeholder="e.g. JOHN SMITH"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </div>

        <Button className="w-full" onClick={submit} disabled={isSearching || name.trim().length === 0}>
          {isSearching ? "Searching…" : "Search Director"}
        </Button>
      </CardContent>
    </Card>
  );
}
