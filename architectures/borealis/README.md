# Borealis

Borealis is our fast/slow self-updating model architecture. It is defined in
`architectures/borealis/model.py` and follows the repository’s stateful model
contract.

The invocation has two phases:

1. Predict context transitions with the fast state available before each update.
2. Run the final output head after the full context adaptation scan.

The final target loss is the differentiable outer-learning signal for durable
parameters. Fast adaptation remains run-local, and consolidation runs at every
invocation boundary. The public architecture returns the completed output;
internal loss values remain available to training helpers rather than becoming
part of the serving contract.
