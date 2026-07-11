import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface SiteLogoProps {
  className?: string;
  showWordmark?: boolean;
}

export function SiteLogo({ className, showWordmark = true }: SiteLogoProps) {
  return (
    <Link href="/" className={cn("inline-flex items-center gap-2.5 group shrink-0", className)}>
      <Image
        src="/images/bowyer-logo.png"
        alt="BOWYER"
        width={28}
        height={28}
        className="size-7 object-contain"
        priority
      />
      {showWordmark && (
        <Image
          src="/images/bowyer-wordmark.png"
          alt="BOWYER"
          width={1372}
          height={170}
          className="h-[13px] w-auto object-contain"
          priority
        />
      )}
    </Link>
  );
}
