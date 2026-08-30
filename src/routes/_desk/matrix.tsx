import { createFileRoute } from "@tanstack/react-router";
import { MatrixView } from "@/components/surge/matrix-view";

export const Route = createFileRoute("/_desk/matrix")({
  component: MatrixView,
});
