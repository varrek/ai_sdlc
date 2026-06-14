import type { Adapter, EmitResult, NeutralModel } from "../../core/types.js";
import { emitInstructions } from "./instructions.js";
import { emitSkills } from "./skills.js";

export class CursorAdapter implements Adapter {
  readonly host = "cursor" as const;

  emit(model: NeutralModel): EmitResult {
    return {
      files: [...emitInstructions(model), ...emitSkills(model)],
      gaps: [],
    };
  }
}
