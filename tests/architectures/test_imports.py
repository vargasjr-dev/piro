def test_canonical_piro_model_imports():
    from architectures.ashfall.ctm import ContinuousThoughtModel, CTMConfig
    from architectures.baseline_transformer.model import BaselineTransformer, TransformerConfig

    assert ContinuousThoughtModel(CTMConfig()).n_neurons == 4
    assert BaselineTransformer(TransformerConfig()).out_proj.out_features == 5
