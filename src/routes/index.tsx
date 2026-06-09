import { createFileRoute } from "@tanstack/react-router";
import JvisionPortfolio from "@/components/JvisionPortfolio";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Jvision — Portfolio" },
      { name: "description", content: "Jvision: visual artist portfolio. Defining the unseen." },
      { property: "og:title", content: "Jvision — Portfolio" },
      { property: "og:description", content: "Visual art, editorial, and direction by Jvision." },
    ],
  }),
  component: JvisionPortfolio,
});
