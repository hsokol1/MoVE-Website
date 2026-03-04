from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from app.queries import extraction, fetch_move_equation_scores, fetch_state_counties_census_data, get_state_ids_from_abbrevs, get_variable_lists
from fastapi import Query, HTTPException
import pandas as pd
import numpy as np

app = FastAPI()

# Mount static directory, Starts everything
app.mount("/static", StaticFiles(directory="static"), name="static")

# Templates directory
templates = Jinja2Templates(directory="templates")


@app.get("/health")
def health_check():
    return {"status": "ok"}

# INITIALIZES THE APP, OPENS index.html
@app.get("/", response_class=HTMLResponse)
def read_root(request: Request):
    return templates.TemplateResponse(
        "index.html",
        {"request": request}
    )

@app.get('/api/state-scores')
def state_MoVE_score():
    countyScores = fetch_move_equation_scores()
    stateScores = countyScores.groupby('state_id').agg(
        {
            'move_score_0_100': 'mean',
            'county_id': 'count'
        }
    ).reset_index()
    stateScoresDict = {
        str(row['state_id']): {
            "score": round(row['move_score_0_100'], 2),
        }
        for _, row in stateScores.iterrows()
    }
    return stateScoresDict

@app.get('/api/county-scores')
def county_MoVE_score():
    data = fetch_move_equation_scores()
    countyScores = {
        str(row['county_id']): {
            "name": row['county_name'],
            "score": round(row['move_score_0_100'], 2)
        }
        for _, row in data.iterrows()
        }
    return countyScores

@app.get("/api/state-census/{state_id}")
def state_census_data(state_id: str):
    census_data = fetch_state_counties_census_data(state_id)
    if not census_data:
        raise HTTPException(status_code=404, detail="State not found")
    return census_data

@app.get("/extract")
def extract(request: Request):
    return templates.TemplateResponse(
        "extract.html",
        {"request": request}
    )

@app.get("/variables")
def variables(request: Request):
    return templates.TemplateResponse(
        "variables.html",
        {"request": request}
    )

@app.get("/all-variables")
def get_all_variables():
   variables = get_variable_lists()
   return variables



@app.post("/data-extract")
def data_extract(variables: dict):
    level = variables["geography"]["level"]
    if level == "county":
        counties = variables["geography"]["counties"]
        df = extraction("county", counties, variables)
    else:
        states = variables["geography"]["states"]
        state_ids = get_state_ids_from_abbrevs(states)
        df = extraction("state", state_ids, variables)
    
    data = (
        df.replace({pd.NA: None})
        .replace({np.nan: None, np.inf: None, -np.inf: None})
        .to_dict(orient="records")
    )
    print({
        "status": "ok",
        "rows": len(df),
        "data": data
    })
    
    return {
        "status": "ok",
        "rows": len(df),
        "data": data
    }

@app.get("/methods", response_class=HTMLResponse)
async def methods(request: Request):
    return templates.TemplateResponse("methods.html", {"request": request})

@app.get("/about", response_class=HTMLResponse)
async def about_us(request: Request):
    return templates.TemplateResponse("aboutus.html", {"request": request})

@app.get("/publications", response_class=HTMLResponse)
async def publications(request: Request):
    return templates.TemplateResponse("publications.html", {"request": request})
