export const START = "__start__";
export const END = "__end__";

type StatePatch<TState> = Partial<TState> | Promise<Partial<TState>>;
type NodeHandler<TState> = (state: TState) => StatePatch<TState>;
type ConditionalResolver<TState> = (state: TState) => string;

interface ConditionalEdge<TState> {
  resolver: ConditionalResolver<TState>;
  mapping: Record<string, string>;
}

export class StateGraph<TState extends Record<string, unknown>> {
  private readonly nodes = new Map<string, NodeHandler<TState>>();
  private readonly edges = new Map<string, string[]>();
  private readonly conditionalEdges = new Map<string, ConditionalEdge<TState>>();

  addNode(name: string, handler: NodeHandler<TState>): this {
    this.nodes.set(name, handler);
    return this;
  }

  addEdge(from: string, to: string): this {
    const existing = this.edges.get(from) ?? [];
    this.edges.set(from, [...existing, to]);
    return this;
  }

  addConditionalEdges(from: string, resolver: ConditionalResolver<TState>, mapping: Record<string, string>): this {
    this.conditionalEdges.set(from, { resolver, mapping });
    return this;
  }

  compile(): { invoke: (initialState: TState) => Promise<TState> } {
    return {
      invoke: async (initialState: TState): Promise<TState> => {
        let state = { ...initialState };
        let current = this.nextNode(START, state);
        const visited = new Set<string>();

        while (current !== END) {
          const handler = this.nodes.get(current);
          if (!handler) {
            throw new Error(`LangGraph node "${current}" is not registered.`);
          }

          const patch = await handler(state);
          state = { ...state, ...patch };

          const visitKey = `${current}:${visited.size}`;
          visited.add(visitKey);
          if (visited.size > 100) {
            throw new Error("LangGraph execution exceeded 100 node transitions.");
          }

          current = this.nextNode(current, state);
        }

        return state;
      }
    };
  }

  private nextNode(from: string, state: TState): string {
    const conditional = this.conditionalEdges.get(from);
    if (conditional) {
      const branch = conditional.resolver(state);
      const mapped = conditional.mapping[branch];
      if (!mapped) {
        throw new Error(`LangGraph branch "${branch}" from "${from}" is not mapped.`);
      }
      return mapped;
    }

    const next = this.edges.get(from) ?? [];
    if (next.length === 0) {
      return END;
    }
    if (next.length > 1) {
      throw new Error(`LangGraph node "${from}" has multiple plain edges. Use addConditionalEdges.`);
    }
    return next[0];
  }
}

