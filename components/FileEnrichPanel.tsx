"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, FileSpreadsheet } from "lucide-react";
import { parseCompanyNumbersFromText } from "@/lib/companyNumbersFromFile";
import { cn } from "@/lib/utils";

export interface FileEnrichPanelProps {
  onNumbersReady: (numbers: string[]) => void;
  disabled?: boolean;
}

export function FileEnrichPanel({ onNumbersReady, disabled }: FileEnrichPanelProps) {
  const [dragOver, setDragOver] = React.useState(false);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [previewCount, setPreviewCount] = React.useState<number | null>(null);
  const [lastNumbers, setLastNumbers] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const processText = (text: string, name: string) => {
    const nums = parseCompanyNumbersFromText(text);
    setFileName(name);
    setPreviewCount(nums.length);
    setLastNumbers(nums);
    if (nums.length === 0) {
      setError("No company numbers found. Use company_number column or one number per line.");
    } else {
      setError(null);
    }
  };

  const handleFile = (file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = () => processText(String(reader.result ?? ""), file.name);
    reader.onerror = () => setError("Could not read file.");
    reader.readAsText(file, "UTF-8");
  };

  return (
    <Card className="w-full border-border/80 shadow-sm dark:border-border/50">
      <CardHeader className="space-y-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <FileSpreadsheet className="size-4 shrink-0 text-muted-foreground" />
          Enrich from file
        </CardTitle>
        <CardDescription>
          Drop a <strong>.csv</strong> or <strong>.txt</strong> with a <code className="text-xs">company_number</code>{" "}
          column, or one company number per line. We fetch name, registered address, directors and director addresses
          from Companies House (max 500 per run by default).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.txt,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />

        <div
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              if (!disabled) inputRef.current?.click();
            }
          }}
          onClick={() => !disabled && inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (disabled) return;
            const f = e.dataTransfer.files[0];
            if (f) handleFile(f);
          }}
          className={cn(
            "flex min-h-[140px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors",
            dragOver && "border-primary bg-muted/50",
            disabled && "pointer-events-none opacity-50"
          )}
        >
          <Upload className="size-8 text-muted-foreground" />
          <span>Drop file here or click to choose</span>
          {fileName && (
            <span className="text-xs text-muted-foreground">
              {fileName}
              {previewCount != null && ` · ${previewCount} number(s) found`}
            </span>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          className="w-full"
          disabled={disabled || lastNumbers.length === 0}
          onClick={() => onNumbersReady(lastNumbers)}
        >
          {disabled ? "Working…" : "Enrich from Companies House"}
        </Button>
      </CardContent>
    </Card>
  );
}
