// Shape of public/data/meta.json, written by data/build.ts and read by the site.
// Every number displayed about the dataset comes from here.
export interface TypeMeta {
  name: string;
  region: number;
  offset: number;
  count: number;
  /** transmitter prediction histogram over the bodies of this type */
  nt: Record<string, number>;
  /** sign used for the majority transmitter (+1 / -1 / 0) */
  sign: -1 | 0 | 1;
  /** neurons per side: [left, right, other] */
  sides: [number, number, number];
}

export interface Meta {
  schema: 1;
  built_at: string;
  build_hash: string;
  dataset: {
    name: string;
    short: string;
    version: string;
    license: string;
    license_url: string;
    url: string;
    download_url: string;
    citation: string;
    files: { name: string; bytes: number }[];
  };
  n_neurons: number;
  n_edges: number;
  n_synapses: number;
  full: {
    n_bodies_annotated: number;
    n_bodies_typed: number;
    n_edges_total: number;
    n_synapses_total: number;
  };
  regions: string[];
  region_offsets: number[];
  types: TypeMeta[];
  requested_types: string[];
  found_types: string[];
  missing_types: string[];
  nt_field: string;
  nt_sign_map: Record<string, number>;
  nt_unknown_count: number;
  thresholds: {
    base_min_weight: number;
    pair_overrides: [string, string, number][];
    dropped_edges_threshold: number;
    dropped_synapses_threshold: number;
    dropped_edges_unknown_sign: number;
  };
  photoreceptors: {
    n: number;
    grid: [number, number];
    eyes: number;
    from_hex_columns: number;
    from_hash: number;
    assignment: string;
  };
  files: {
    neurons: string;
    neurons_bytes: number;
    neurons_bytes_gz: number;
    connectome: string;
    connectome_bytes: number;
    connectome_bytes_gz: number;
  };
}
