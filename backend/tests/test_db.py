from sqlalchemy import text


def test_database_connection(db):
    assert db.execute(text("SELECT 1")).scalar() == 1


def test_tests_run_on_the_test_database(db):
    assert db.execute(text("SELECT current_database()")).scalar().endswith("_test")