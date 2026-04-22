import { Agent, AgentStatus } from "./Types";
import { AgentStore } from "./State/AgentStore";

type MessageEntry = ["user" | "agent", string];

interface TopicSeed {
  title: string;
  messages: MessageEntry[];
}

interface AgentSeed {
  agent: Agent;
  topics: TopicSeed[];
  activeTopicIndex: number;
}

const AGENT_SEEDS: AgentSeed[] = [
  {
    agent: {
      id: "agent-1",
      name: "Scout",
      description: "Reconnaissance and environment scanning",
      status: AgentStatus.Idle,
      currentTaskId: null,
    },
    activeTopicIndex: 0,
    topics: [
      {
        title: "Sector 7 Scan",
        messages: [
          ["user", "Status?"],
          ["agent", "All clear."],
          ["user", "Scan sector 7."],
          [
            "agent",
            "Scanning now. I've picked up 2 thermal signatures near the north ridge at grid NR-4417. Confidence is 87%. The signatures are stationary and have been in the same position for at least 12 minutes based on heat decay patterns.",
          ],
          ["user", "Get closer."],
          ["agent", "Moving. ETA 45 seconds."],
          ["user", "Visual?"],
          [
            "agent",
            "Two figures near a rock formation. Stationary. Appear to be resting.",
          ],
          ["user", "ID them."],
          [
            "agent",
            "No database match. Likely civilian hikers based on clothing and gear. They have standard recreational backpacks, no equipment of concern. One is seated, the other is standing and looking at what appears to be a paper map.",
          ],
          ["user", "Terrain?"],
          ["agent", "Rocky outcrop, sparse tree cover, 340m elevation."],
          ["user", "Mark and continue."],
          ["agent", "Done."],
        ],
      },
      {
        title: "Base Status",
        messages: [
          ["user", "How much is left?"],
          ["agent", "62%."],
          ["user", "Faster."],
          [
            "agent",
            "Increasing speed. New ETA 5 minutes. Detection accuracy drops from 94% to 81% at this velocity. I'll flag anything below the confidence threshold for a second pass if you want.",
          ],
          ["user", "Fine. Other sectors?"],
          ["agent", "8 and 12 queued."],
          ["user", "Do 12 next."],
          ["agent", "Updated."],
        ],
      },
      {
        title: "Patrol Report",
        messages: [
          ["user", "Summary of today."],
          [
            "agent",
            "4 sectors swept. 2 thermal hits (civilian hikers, sector 7). 1 wildlife detection (deer, sector 3). Zero threats. Overall coverage is at 38% of the full patrol grid. At current pace we should complete the remaining sectors in about 45 minutes, assuming no detours for investigation.",
          ],
          ["user", "Good work. Keep me posted."],
        ],
      },
    ],
  },
];

export function getMockAgents(): Agent[] {
  return AGENT_SEEDS.map((s) => s.agent);
}

export function seedMockData(store: AgentStore): void {
  store.setAgents(getMockAgents());

  for (const seed of AGENT_SEEDS) {
    const agentId = seed.agent.id;
    const createdTopics = seed.topics.map((t) =>
      store.addTopic(agentId, t.title)!,
    );

    for (let i = 0; i < seed.topics.length; i++) {
      store.selectTopic(agentId, createdTopics[i].id);
      for (const [sender, content] of seed.topics[i].messages) {
        store.addMessage(agentId, sender, content);
      }
    }

    store.selectTopic(agentId, createdTopics[seed.activeTopicIndex].id);
  }
}
