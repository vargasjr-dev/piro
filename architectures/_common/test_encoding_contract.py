from architectures._common.encoding import memory_embedding, policy_embedding


def test_memory_embedding_shares_key_coordinates_between_write_and_query():
    import torch

    write = memory_embedding("key_017 = value_014", 8, torch_module=torch)
    query = memory_embedding("QUERY:key_017", 8, torch_module=torch)
    assert torch.equal(write[:4], query[:4])
    assert torch.equal(query[4:], torch.zeros(4))
    assert not torch.equal(write[4:], torch.zeros(4))


def test_memory_embedding_distractor_is_deterministic():
    import torch

    first = memory_embedding("token_005_027", 8, torch_module=torch)
    second = memory_embedding("token_005_027", 8, torch_module=torch)
    assert torch.equal(first, second)


def test_policy_embedding_reuses_structured_factor_coordinates():
    import torch

    first = policy_embedding("QUERY|deadline=urgent|budget=tight", 16, torch_module=torch)
    second = policy_embedding("QUERY|deadline=urgent|budget=normal", 16, torch_module=torch)
    repeated = policy_embedding("QUERY|deadline=urgent|budget=tight", 16, torch_module=torch)

    assert torch.equal(first, repeated)
    assert not torch.equal(first, second)
