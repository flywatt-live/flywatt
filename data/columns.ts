// Column names in the MaleCNS v1.0 flat-connectome feather files.
// Filled from `npm run data:probe` output; build.ts refuses to run if any is missing.
export const RAW_DIR = 'data/raw';
export const FILES = {
  annotations: 'body-annotations-male-cns-v1.0-minconf-0.5.feather',
  neurotransmitters: 'body-neurotransmitters-male-cns-v1.0.feather',
  weights: 'connectome-weights-male-cns-v1.0-minconf-0.5.feather',
} as const;
export const BASE_URL = 'https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/';

export const COLS = {
  ann: {
    bodyId: 'bodyId',
    type: 'type',
    superclass: 'superclass',
    subclass: 'subclass',
    somaSide: 'somaSide',
    rootSide: 'rootSide',
    status: 'status',
    hex1: 'assignedOlHex1',
    hex2: 'assignedOlHex2',
  },
  nt: {
    body: 'body',
    predicted: 'predicted_nt',
    predictedConf: 'predicted_nt_confidence',
    celltypePredicted: 'celltype_predicted_nt',
    consensus: 'consensus_nt',
  },
  w: {
    pre: 'body_pre',
    post: 'body_post',
    weight: 'weight',
  },
} as const;
