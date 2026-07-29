def test_canonical_piro_model_imports():
    from architectures.ashfall.ctm_10x import Ashfall, CTMConfig

    assert Ashfall(CTMConfig()).n_neurons == 4
