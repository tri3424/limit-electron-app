import * as React from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CustomTimePickerProps {
  value?: string; // HH:MM format
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function CustomTimePicker({
  value,
  onChange,
  placeholder = "Select time",
  disabled = false,
}: CustomTimePickerProps) {
  const [hours, minutes] = value ? value.split(":") : ["", ""];

  const hoursOptions = Array.from({ length: 24 }, (_, i) => {
    const h = String(i).padStart(2, "0");
    return { value: h, label: h };
  });

  const minutesOptions = Array.from({ length: 60 }, (_, i) => {
    const m = String(i).padStart(2, "0");
    return { value: m, label: m };
  });

  const handleHoursChange = (newHours: string) => {
    onChange(`${newHours}:${minutes || "00"}`);
  };

  const handleMinutesChange = (newMinutes: string) => {
    onChange(`${hours || "00"}:${newMinutes}`);
  };

  return (
    <div className="flex items-center gap-2 w-full">
      <div className="flex-1">
        <Select
          value={hours || undefined}
          onValueChange={handleHoursChange}
          disabled={disabled}
        >
          <SelectTrigger className="h-10">
            <SelectValue placeholder="HH" />
          </SelectTrigger>
          <SelectContent className="max-h-[200px]">
            {hoursOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <span className="text-lg font-semibold text-muted-foreground">:</span>
      <div className="flex-1">
        <Select
          value={minutes || undefined}
          onValueChange={handleMinutesChange}
          disabled={disabled}
        >
          <SelectTrigger className="h-10">
            <SelectValue placeholder="MM" />
          </SelectTrigger>
          <SelectContent className="max-h-[200px]">
            {minutesOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

