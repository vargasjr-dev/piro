def test_canonical_piro_model_imports():
    from architectures.ashfall.ctm_10x import ContinuousThoughtModel, CTMConfig

    assert ContinuousThoughtModel(CTMConfig()).n_neurons == 4
