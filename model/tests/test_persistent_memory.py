from dataclasses import dataclass

from model.benchmarks.persistent_memory import PersistentMemoryBenchmark


@dataclass
class FakeState:
    memory: dict[str, str]


class FakeMemoryModel:
    def initial_state(self):
        return FakeState({})

    def step(self, prompt, state):
        for line in prompt.splitlines():
            observation = line.strip()
            if not observation:
                continue
            if "=" in observation:
                key, value = (part.strip() for part in observation.split("=", maxsplit=1))
                state.memory[key] = value
            elif observation.startswith("token_"):
                continue
            else:
                return state.memory.get(observation, "UNKNOWN"), state
        return "", state

    def reset_state(self, state):
        return FakeState({})

    def snapshot_state(self, state):
        return dict(state.memory)

    def load_state(self, snapshot):
        return FakeState(dict(snapshot))


def test_benchmark_distinguishes_retained_reset_and_restored_state():
    result = PersistentMemoryBenchmark(n_episodes=8, n_writes=3, delay=4, seed=4).run(FakeMemoryModel())
    assert result.metadata["retained"]["accuracy"] == 1.0
    assert result.metadata["serialized_restore"]["accuracy"] == 1.0
    assert result.metadata["reset_before_query"]["accuracy"] == 0.0
