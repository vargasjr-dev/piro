def test_canonical_piro_model_imports():
    from piro.baseline_transformer import BaselineTransformer, TransformerConfig
    from piro.borealis import Borealis, BorealisConfig
    from piro.ctm import ContinuousThoughtModel, CTMConfig

    assert ContinuousThoughtModel(CTMConfig()).n_neurons == 4
    assert BaselineTransformer(TransformerConfig()).out_proj.out_features == 5
    assert Borealis(BorealisConfig()).config.vocab_size == 32
