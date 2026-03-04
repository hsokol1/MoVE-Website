from typing import List
from app.db import get_db_connection
import pandas as pd

def normalize_to_list(x):
    if x is None:
        return []
    if isinstance(x, list):
        out = []
        for item in x:
            if isinstance(item, dict):
                out.append(item.get("label") or item.get("id"))
            else:
                out.append(item)
        return out
    if isinstance(x, dict):
        return [k for k, v in x.items() if v]
    return [x]

def fetch_move_equation_scores():
    def get_move_equation_scores() -> pd.DataFrame:
        conn = get_db_connection()
        cur = conn.cursor()

        query = """
        SELECT
            C.county_id,
            C.name AS county_name,
            C.state_id AS state_id,
            Q.question_id,
            Q.question,
            Q.category,
            R.value AS response_value
        FROM Responses R
        JOIN Counties C ON C.county_id = R.county_id
        JOIN Questions Q ON Q.question_id = R.question_id
        ORDER BY C.county_id, Q.question_id
        """
        cur.execute(query)
        rows = cur.fetchall()
        conn.close()

        return pd.DataFrame([dict(r) for r in rows])


    def build_category_scores(df: pd.DataFrame) -> pd.DataFrame:
        df_cat = (
            df.groupby(["county_id", "county_name", "state_id", "category"], as_index=False)["response_value"]
            .sum()
            .rename(columns={"response_value": "category_score"})
        )

        df_wide = (
            df_cat.pivot_table(
                index=["county_id", "county_name", "state_id"],
                columns="category",
                values="category_score",
                aggfunc="first"
            )
            .reset_index()
        )

        df_wide.columns.name = None
        return df_wide
    
    def fix_post_office(df: pd.DataFrame) -> pd.DataFrame:

        reverse_col = ['Local Post Office']

        for col in reverse_col:
            if col in df.columns:
                col_min = df[col].min()
                col_max = df[col].max()
                if col_max != col_min:
                    df[col] = col_max - df[col]  # equivalent to (col_max + col_min) - df[col] if you want symmetry
                else:
                    df[col] = 0
        return df


    def score(df_final: pd.DataFrame) -> pd.DataFrame:
        df = df_final.copy()

        df = df.drop(columns=["Abuses"], errors="ignore")

        # Category columns = everything except IDs/names
        id_cols = ["county_id", "county_name", "state_id"]
        cat_columns = [c for c in df.columns if c not in id_cols]

        # Make sure category columns are numeric and fill missing scores with 0
        df[cat_columns] = df[cat_columns].apply(pd.to_numeric, errors="coerce").fillna(0)
    
        # Z-score standardize with zero-variance protection
        df_z = df.copy()
        for col in cat_columns:
            mean = df[col].mean()
            std = df[col].std()

            if std == 0 or pd.isna(std):
                df_z[col] = 0  # neutral contribution if no variance
            else:
                df_z[col] = (df[col] - mean) / std

        # Additive composite (sum of z-scores)
        df_z["move_additive_z"] = df_z[cat_columns].sum(axis=1)

        # Min-Max normalize additive score (0–100)
        min_v = df_z["move_additive_z"].min()
        max_v = df_z["move_additive_z"].max()

        if max_v == min_v:
            df_z["move_score_0_100"] = 50.0  # everything identical -> give neutral 50
        else:
            df_z["move_score_0_100"] = ((df_z["move_additive_z"] - min_v) / (max_v - min_v)) * 100

        # Debug: check z-score means/stds
        print("\nPost-standardization check (category z-scores):")
        print(df_z[cat_columns].agg(["mean", "std"]))

        print("\nPreview:")
        print(df_z[id_cols + ["move_additive_z", "move_score_0_100"]].head())

        return df_z

    #Grab all MoVE data for individual counties, every question
    df_raw = get_move_equation_scores()

    #Sum the questions for every MoVE variable
    df_cat_wide = build_category_scores(df_raw)

    #Reverse Polling place score
    df_post_office_fixed = fix_post_office(df_cat_wide)

    # Score and export (MoVE equation)
    df_scored = score(df_post_office_fixed)

    df_scored = df_scored[['county_id', 'county_name', 'state_id', 'move_score_0_100']]

    df_scored['move_score_0_100'] = df_scored['move_score_0_100'].round(1)

    return df_scored

def fetch_state_counties_census_data(state_id) -> dict:
    conn = get_db_connection()

    query = """
    SELECT
        c.county_id,
        c.name AS county_name,
        v.name AS variable,
        f.data AS value
    FROM census_facts f
    JOIN census_variables v
      ON f.variable_id = v.variable_id
    JOIN counties c
      ON f.county_id = c.county_id
    WHERE c.state_id = ?
      AND v.name IN (
        'Overall Population',
        'Overall median earnings',
        'Estimate of the population (25 years and over) with a Bachelor’s degree (regardless of place of birth)'
      )
    ORDER BY c.county_id, v.name;
    """

    df = pd.read_sql(query, conn, params=(state_id,))
    conn.close()

    df["variable"] = df["variable"].replace({
        "Estimate of the population (25 years and over) with a Bachelor’s degree (regardless of place of birth)":
        "Overall Bachelor's degree population"
    })

    out = {}
    for (county_id, county_name), sub in df.groupby(["county_id", "county_name"]):
        out[county_id] = {
            "county_name": county_name,
            "data": sub.set_index("variable")["value"].to_dict()
        }

    return out

def get_variable_lists():
    def county_variables() -> list:
        conn = get_db_connection()
        query = "SELECT DISTINCT category FROM questions ORDER BY category;"
        df = pd.read_sql(query, conn)
        conn.close()
        return df['category'].tolist()

    def state_variables() -> list:
        conn = get_db_connection()
        query = """SELECT name
                    FROM pragma_table_info('state_MoVE_data')
                    WHERE name <> 'state_id';
                """
        df = pd.read_sql(query, conn)
        conn.close()
        return df['name'].tolist()

    def census_variables() -> list:
        conn = get_db_connection()
        query = """SELECT name FROM census_variables;"""
        df = pd.read_sql(query, conn)
        conn.close()
        return df['name'].tolist()
    
    county = county_variables()
    state = state_variables()
    census = census_variables()

    return {
        "county_variables": county,
        "state_variables": state,
        "census_variables": census
    }


def get_state_ids_from_abbrevs(state_abbrevs: List[str]) -> List[str]:
    if not state_abbrevs:
        raise ValueError("Provide at least one state abbreviation.")
    conn = get_db_connection()
    try:
        placeholders = ",".join(["?"] * len(state_abbrevs))
        query = f"""
                SELECT DISTINCT state_id, abbrev
                FROM states
                WHERE abbrev IN ({placeholders})
            """
        df = pd.read_sql(query, conn, params=state_abbrevs)
        abbrev_to_id = dict(zip(df["abbrev"], df["state_id"]))
        state_ids = [abbrev_to_id[abbrev] for abbrev in state_abbrevs if abbrev in abbrev_to_id]
        return state_ids
    finally:
        conn.close()


def extraction(level: str, locations: list, variables: dict) -> pd.DataFrame:
    def extract_census_data(level, geography, census_variables) -> pd.DataFrame:
        if not census_variables:
            raise ValueError("Provide at least one census variable name.")
        conn = get_db_connection()
        try:
            var_placeholders = ",".join(["?"] * len(census_variables))
            params: list = list(census_variables)
            where_geo_sql = ""
            if level == "county":
                county_placeholders = ",".join(["?"] * len(geography))
                where_geo_sql = f"cf.county_id IN ({county_placeholders})"
                params.extend(list(geography))
            else:
                state_placeholders = ",".join(["?"] * len(geography))
                where_geo_sql = f"c.state_id IN ({state_placeholders})"
                params.extend(list(geography))

            query = f"""
                SELECT
                    cf.county_id,
                    cv.name AS variable_name,
                    cf.data,
                    c.name AS county_name
                FROM census_facts cf
                JOIN census_variables cv
                ON cv.variable_id = cf.variable_id
                JOIN counties c
                ON c.county_id = cf.county_id
                WHERE
                    cv.name IN ({var_placeholders})
                    AND {where_geo_sql}
                ORDER BY
                    cf.county_id, cv.name
            """

            long_df = pd.read_sql(query, conn, params=params)
            wide_df = (
                long_df.pivot_table(
                    index=["county_id", "county_name"],
                    columns="variable_name",
                    values="data",
                    aggfunc="first",
                )
                .reset_index()
            )
            wide_df.columns.name = None

            ordered_cols = ["county_id", "county_name"] + [v for v in census_variables if v in wide_df.columns]
            wide_df = wide_df.reindex(columns=ordered_cols)

            return wide_df

        finally:
            conn.close()

    def extract_county_move_vars(level: str, geography: dict, move_variables: List[str]) -> pd.DataFrame:
        if not move_variables:
            raise ValueError("No county MoVE variables provided.")

        if level not in {"state", "county"}:
            raise ValueError("Level must be 'state' or 'county'.")

        conn = get_db_connection()

        try:
            var_placeholders = ",".join(["?"] * len(move_variables))
            params = list(move_variables)
            print(type(move_variables))

            if level == "county":
                geo_placeholders = ",".join(["?"] * len(geography))
                geo_sql = f"c.county_id IN ({geo_placeholders})"
                params.extend(geography)
            else: 
                geo_placeholders = ",".join(["?"] * len(geography))
                geo_sql = f"c.state_id IN ({geo_placeholders})"
                params.extend(geography)

            query = f"""
                SELECT
                    c.county_id,
                    c.name AS county_name,
                    q.category AS variable_name,
                    SUM(cmd.value) AS value
                FROM responses cmd
                JOIN questions q
                ON q.question_id = cmd.question_id
                JOIN counties c
                ON c.county_id = cmd.county_id
                WHERE
                    q.category IN ({var_placeholders})
                    AND {geo_sql}
                GROUP BY
                    c.county_id,
                    c.name,
                    q.category
                ORDER BY
                    c.county_id,
                    q.category
            """

            df_long = pd.read_sql(query, conn, params=params)

            df_wide = (
                df_long
                .pivot_table(
                    index=["county_id", "county_name"],
                    columns="variable_name",
                    values="value",
                    aggfunc="first"
                )
                .reset_index()
            )
            df_wide.columns.name = None
            return df_wide

        finally:
            conn.close()


    def extract_state_move_vars(level: str, geography: list, state_variables: List[str]) -> pd.DataFrame:
        if level not in {"state", "county"}:
            raise ValueError("level must be 'state' or 'county'.")

        if not state_variables:
            raise ValueError("Provide at least one state MoVE variable (column name).")

        conn = get_db_connection()
        try:
            state_table = "state_MoVE_data"
            counties_table = "counties"
            state_id_col = "state_id"
            county_id_col = "county_id"
            county_name_col = "name"

            cols_df = pd.read_sql(f"SELECT name FROM pragma_table_info('{state_table}')", conn)
            valid_cols = set(cols_df['name'].tolist())
            valid_cols.discard(state_id_col)

            missing = [c for c in state_variables if c not in valid_cols]
            if missing:
                raise ValueError(f"Unknown state variable columns: {missing}")

            col_select_sql = ", ".join([f's."{c}" AS "{c}"' for c in state_variables])

            if level == "state":
                states = geography
                where_sql = f"c.state_id IN ({','.join(['?'] * len(states))})"
                params = list(states)
            else:
                counties = geography
                where_sql = f"c.county_id IN ({','.join(['?'] * len(counties))})"
                params = list(counties)

            query = f"""
                SELECT
                    c.{county_id_col} AS county_id,
                    c.{county_name_col} AS county_name,
                    {col_select_sql}
                FROM {counties_table} c
                JOIN {state_table} s
                ON s.{state_id_col} = c.{state_id_col}
                WHERE {where_sql}
                ORDER BY c.{state_id_col}, c.{county_id_col}
            """

            return pd.read_sql(query, conn, params=params)

        finally:
            conn.close()

    print(f"Extraction called with level={level}, locations={locations}")
    print(type(locations))
    
    if level not in {"state", "county"}:
        raise ValueError("level must be 'state' or 'county'.")

    if not locations:
        raise ValueError("At least one location must be provided.")

    if "variables" not in variables:
        raise ValueError("variables dict missing 'variables' key.")

    dfs: List[pd.DataFrame] = []

    census_vars = normalize_to_list(variables["variables"].get("census", []))
    county_vars = normalize_to_list(variables["variables"].get("county", []))
    state_vars  = normalize_to_list(variables["variables"].get("state", []))

    # --- Census variables ---
    if census_vars:
        census_df = extract_census_data(level, locations, census_vars)
        dfs.append(census_df)

    # --- County MoVE variables ---
    if county_vars:
        county_move_df = extract_county_move_vars(level, locations, county_vars)
        dfs.append(county_move_df)

    # --- State MoVE variables ---
    if state_vars:
        state_move_df = extract_state_move_vars(level, locations, state_vars)
        dfs.append(state_move_df)

    # --- MoVE Score -------
    if variables.get("includeMoveScore", False):
        move_score_df = fetch_move_equation_scores()
        if level == "state":
            move_score_df = move_score_df[move_score_df["state_id"].isin(locations)]
        else:
            move_score_df = move_score_df[move_score_df["county_id"].isin(locations)]
        move_score_df = move_score_df.rename(columns={"move_score_0_100": "MoVE_Score"})
        move_score_df.drop(columns=["state_id"], inplace=True, errors='ignore')
        dfs.append(move_score_df)

    if not dfs:
        raise ValueError("No variables selected for extraction.")

    # --- Merge everything together ---
    merged_df = dfs[0]

    for df in dfs[1:]:
        merged_df = merged_df.merge(
            df,
            on=["county_id", "county_name"],
            how="left"
        )
    return merged_df
