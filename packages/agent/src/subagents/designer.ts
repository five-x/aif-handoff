import { runResearchDesignStage } from "./researchDesignStage.js";

export async function runDesigner(taskId: string, projectRoot: string): Promise<void> {
  await runResearchDesignStage("design", taskId, projectRoot);
}
