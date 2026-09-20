"use client";

import Link from "next/link";

type SearchType = {
    title: string;
    href: string;
};

const searchSugg: SearchType[] = [
       { title: "Support", href: "https://shadcndashboard.dev/support" },
    { title: "License", href: "https://shadcndashboard.dev/license" },
];

export default function Footer() {
    return (
        <div className="flex md:flex-row flex-col items-center justify-between gap-3 text-center">
            <p className="text-sm text-muted-foreground">
                © 2026 by{" "}
                <Link
                    href="https://shadcndashboard.dev/" target="_blank"
                    className="hover:text-primary text-muted-foreground"
                >
                    shadcndashboard
                </Link>
                , creating a better web for you.
            </p>

            <div className="flex gap-4">
                {searchSugg.map((item, index) => (
                    <Link
                        key={index}
                        target="_blank"
                        href={item.href}
                        className="text-sm hover:text-primary text-muted-foreground"
                    >
                        {item.title}
                    </Link>
                ))}
            </div>
        </div>
    );
}
