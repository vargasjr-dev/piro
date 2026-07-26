def test_canonical_piro_model_imports():
    from architectures.baseline_transformer.model import BaselineTransformer, TransformerConfig
    from architectures.ctm.model import ContinuousThoughtModel, CTMConfig

    assert ContinuousThoughtModel(CTMConfig()).n_neurons == 4
    assert BaselineTransformer(TransformerConfig()).out_proj.out_features == 5
