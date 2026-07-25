"""Ashfall associative-recall CTM scaled to approximately 10× parameters.

The Modal trainer maps this file name to the ``ctm-10x`` template. The
configuration is 6 neurons, 16-dimensional input/query/value representations,
and an 88-unit hidden layer, producing 20,047 parameters versus 2,005 for the
baseline associative-recall CTM (9.9985×).
"""

# This entrypoint is intentionally documentation-first. Training is dispatched
# by the Modal worker from the architecture path's final component.

MODEL_TEMPLATE = "ctm-10x"


if __name__ == "__main__":
    print(MODEL_TEMPLATE)
