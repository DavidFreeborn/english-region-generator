CALIBRATION BUNDLE — The County Surveyor v9.1
================================================

Contents
--------
atlas_ethnicity_2021.json   Raw reference table: ONS Census 2021 ethnic-group
                            profiles for 23 English local authorities, as
                            retrieved 2026-07-18 from the Cabinet Office
                            Ethnicity Facts and Figures service (TS021-derived,
                            19+1 classification, aggregated to the engine's ten
                            groups per the concordance below). Provenance and
                            source URL are embedded in the file.
fit.js                      The fitting script. Deterministic 60/40 train/
                            holdout split by FNV-1a hash of the LAD code
                            (14 training, 9 holdout authorities; the split is
                            recomputable from the codes alone). Fits region-and-
                            class prior means on the training split, writes
                            fitted_priors.json, then scores the holdout against
                            3-seed generation envelopes.
fitted_priors.json          The fitted output actually embedded in the engine,
                            including the recorded split membership.

19+1 -> 10 concordance
----------------------
engine group 0  White British        <- White: English/Welsh/Scottish/NI/British
engine group 1  White other          <- White: Irish; Gypsy or Irish Traveller;
                                        Roma; Other White
engine group 2  Pakistani            <- Asian: Pakistani
engine group 3  Indian               <- Asian: Indian
engine group 4  Bangladeshi          <- Asian: Bangladeshi
engine group 5  Black African        <- Black: African
engine group 6  Black Caribbean      <- Black: Caribbean; Other Black
engine group 7  Chinese              <- Asian: Chinese; Other Asian
engine group 8  Mixed                <- Mixed: all four categories
engine group 9  Other                <- Other: Arab; Any other ethnic group

Reproduction
------------
node fit.js     (re-derives the split, refits, rewrites fitted_priors.json,
                 and prints per-holdout-authority errors and the headline
                 mean absolute error)

Honest caveats, unchanged from the methodology: the sample is 23 of 331
authorities with no London boroughs; one model defect was diagnosed by
inspecting holdout errors, so scores are best read as development-set
performance; the fit covers ethnic composition only.
