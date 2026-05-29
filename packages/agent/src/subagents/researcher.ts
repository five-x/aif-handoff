import { runResearchDesignStage } from "./researchDesignStage.js";

export async function runResearcher(taskId: string, projectRoot: string): Promise<void> {
  await runResearchDesignStage("research", taskId, projectRoot);
}
