import json

from model.data.owner_policy_worlds import (
    POLICIES,
    _case_pool,
    choose_action,
    generate_owner_policy_worlds,
)


def test_generation_is_deterministic_and_json_serializable():
    first = generate_owner_policy_worlds(
        train_per_owner=12,
        eval_per_owner=4,
        teaching_examples=3,
        seed=17,
    )
    second = generate_owner_policy_worlds(
        train_per_owner=12,
        eval_per_owner=4,
        teaching_examples=3,
        seed=17,
    )

    assert first == second
    json.dumps(first)
    assert len(first) == len(POLICIES) * 16


def test_train_and_eval_cases_are_disjoint_and_cover_every_owner():
    records = generate_owner_policy_worlds(
        train_per_owner=30,
        eval_per_owner=10,
        teaching_examples=2,
        seed=21,
    )
    train = [record for record in records if record["metadata"]["split"] == "train"]
    evaluation = [record for record in records if record["metadata"]["split"] == "eval"]

    assert len(train) == len(POLICIES) * 30
    assert len(evaluation) == len(POLICIES) * 10
    assert {record["metadata"]["ownerId"] for record in train} == {
        policy.owner_id for policy in POLICIES
    }
    train_signatures = {
        tuple(packet["parts"][0]["text"] for packet in record["inputs"][-1:])
        for record in train
    }
    eval_signatures = {
        tuple(packet["parts"][0]["text"] for packet in record["inputs"][-1:])
        for record in evaluation
    }
    assert train_signatures.isdisjoint(eval_signatures)


def test_conflicting_policies_disagree_across_the_case_pool():
    cases = _case_pool(64, seed=5)
    safety = next(policy for policy in POLICIES if policy.owner_id == "safety_speed")
    quality = next(policy for policy in POLICIES if policy.owner_id == "quality_speed")

    disagreements = sum(
        choose_action(safety, case.candidates, deadline=case.deadline, budget=case.budget)
        != choose_action(quality, case.candidates, deadline=case.deadline, budget=case.budget)
        for case in cases
    )

    assert disagreements > 0


def test_records_have_structured_history_query_and_no_answer_leakage():
    record = generate_owner_policy_worlds(
        train_per_owner=1,
        eval_per_owner=1,
        teaching_examples=4,
        seed=31,
    )[0]
    packets = [item["parts"][0]["text"] for item in record["inputs"]]
    query = packets[-1]

    assert len(packets) == 5
    assert "SITUATION|" in query
    assert "OPTION|slot=0" in query
    assert "CHOICE|" not in query
    assert record["answer"] not in query
    assert record["answerIndex"] in range(4)
    assert record["metadata"]["randomBaseline"] == 0.25
