from model.memory_encoding import memory_embedding


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
