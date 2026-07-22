from model.weight_serialization import round_nested_numbers


def test_round_nested_numbers_handles_scalar_vector_matrix_and_higher_rank_values():
    assert round_nested_numbers(1.23456789) == 1.234568
    assert round_nested_numbers([1.23456789, 2.0]) == [1.234568, 2.0]
    assert round_nested_numbers([[1.23456789], [2.34567891]]) == [[1.234568], [2.345679]]
    assert round_nested_numbers([[[1.23456789]]]) == [[[1.234568]]]
