declare namespace Serialized {
  // Serialized primitive input types
  export type InputSameShadowPrimitive = [1, string | null | Primitive];
  export type InputNoShadowPrimitive = [2, string | null];
  export type InputDifferentShadowPrimitive = [3, string | null, string | null];
  export type MathNumberPrimitive = [4, string];
  export type PositiveNumberPrimitive = [5, string];
  export type WholeNumberPrimitive = [6, string];
  export type IntegerNumberPrimitive = [7, string];
  export type AngleNumberPrimitive = [8, string];
  export type ColorPickerPrimitive = [9, string];
  export type TextPrimitive = [10, string];
  export type BroadcastPrimitive = [11, string, string];
  export type VariablePrimitive = [12, string, string, number?, number?];
  export type ListPrimitive = [13, string, string, number?, number?];

  // Union of all serialized primitives
  export type Primitive =
    | InputSameShadowPrimitive
    | InputNoShadowPrimitive
    | InputDifferentShadowPrimitive
    | MathNumberPrimitive
    | PositiveNumberPrimitive
    | WholeNumberPrimitive
    | IntegerNumberPrimitive
    | AngleNumberPrimitive
    | ColorPickerPrimitive
    | TextPrimitive
    | BroadcastPrimitive
    | VariablePrimitive
    | ListPrimitive;

  // Block definition
  export interface Block {
    /** The opcode representing the block type. */
    opcode: string;

    /** Optional associated comment id. */
    comment?: string;

    /** The ID of the next block, or null if none. */
    next: string | null;

    /** The ID of the parent block, or null if none. */
    parent: string | null;

    /** Serialized inputs of the block. */
    inputs: Record<string, Primitive | undefined>;

    /** Serialized fields of the block. */
    fields?: Record<string, any>;

    /** Whether the block is a shadow block. */
    shadow: boolean;

    /** Whether the block is a top-level block. */
    topLevel: boolean;

    /** The x-coordinate of the block (if top-level). */
    x?: number;

    /** The y-coordinate of the block (if top-level). */
    y?: number;

    /** Additional mutation data, if applicable. */
    mutation?: Record<string, any>;

    /** The ID of an associated comment, if present. */
    __patch?: string;
  }

  // Either a block or a primitive
  export type BlockOrPrimitive = Block | Primitive;

  /**
   * A mapping of variable IDs to an array containing:
   * - The variable name (string)
   * - The variable value (any)
   * - (Optional) A boolean indicating if the variable is a cloud variable
   */
  export type Variable = [string, any, boolean?];

  /**
   * A mapping of list IDs to an array containing:
   * - The list name (string)
   * - The list values (any array)
   */
  export type List = [string, any];

  /** Broadcast message name */
  export type Broadcast = string;

  // Comment block definition
  export interface Comment {
    /** The ID of the block this comment is attached to. */
    blockId: string;

    /** The x-coordinate position of the comment. */
    x: number;

    /** The y-coordinate position of the comment. */
    y: number;

    /** The width of the comment box. */
    width: number;

    /** The height of the comment box. */
    height: number;

    /** Whether the comment is minimized. */
    minimized: boolean;

    /** The content of the comment. */
    text: string;
  }

  // Costume definition
  export interface Costume {
    /** The name of the costume. */
    name: string;

    /** The resolution of the bitmap. */
    bitmapResolution: number;

    /** The format of the image data (e.g., "png", "jpg"). */
    dataFormat: string;

    /** The unique identifier for the costume asset. */
    assetId: string;

    /** The asset's MD5 hash with its file extension. */
    md5ext: string;

    /** The X coordinate of the costume's rotation center. */
    rotationCenterX: number;

    /** The Y coordinate of the costume's rotation center. */
    rotationCenterY: number;
  }

  // Sound definition
  export interface Sound {
    /** The name of the sound. */
    name: string;

    /** The unique identifier for the sound asset. */
    assetId: string;

    /** The format of the sound data (e.g., "wav", "mp3"). */
    dataFormat: string;

    /** The audio encoding format. */
    format: string;

    /** The sample rate of the sound (in Hz). */
    rate: number;

    /** The total number of audio samples. */
    sampleCount: number;

    /** The asset's MD5 hash with file extension. */
    md5ext: string;
  }

  // Base target shared by sprite and stage
  export interface BaseTarget {
    /** The name of the target. */
    name: string;

    /** Serialized variables. */
    variables: Record<string, Variable>;

    /** Serialized lists. */
    lists: Record<string, List>;

    /** Serialized broadcasts. */
    broadcasts: Record<string, Broadcast>;

    /** Serialized blocks. */
    blocks: Record<string, BlockOrPrimitive>;

    /** Serialized comments. */
    comments: Record<string, Comment>;

    /** Index of the current costume. */
    currentCostume: number;

    /** Serialized costumes. */
    costumes: Costume[];

    /** Serialized sounds. */
    sounds: Sound[];

    /** Volume level. */
    volume?: number;

    /** Layer order. */
    layerOrder?: number;
  }

  // Stage definition
  export interface Stage extends BaseTarget {
    /** Whether the target is a stage. */
    isStage: true;

    /** Tempo. */
    tempo?: number;

    /** Video transparency. */
    videoTransparency?: number;

    /** Video state. */
    videoState?: string;

    /** Text-to-speech language. */
    textToSpeechLanguage?: string;
  }

  // Sprite definition
  export interface Sprite extends BaseTarget {
    /** Whether the target is a stage. */
    isStage: false;

    /** Visibility. */
    visible: boolean;

    /** X position. */
    x: number;

    /** Y position. */
    y: number;

    /** Size. */
    size: number;

    /** Direction. */
    direction: number;

    /** Whether the sprite is draggable. */
    draggable: boolean;

    /** Rotation style of the sprite. */
    rotationStyle?: "all around" | "left-right" | "dont't rotate";
  }

  // A target can be a stage or a sprite
  export type Target = Stage | Sprite;

  // Monitor definition for lists
  export interface ListMonitor {
    /** The unique ID of the monitor. */
    id: string;

    /** The display mode. */
    mode: string;

    /** The opcode associated with the monitor. */
    opcode: string;

    /** The parameters used by the monitor. */
    params: Record<string, string>;

    /** The name of the sprite associated with the monitor, if any. */
    spriteName?: string;

    /** The current value being displayed by the monitor. */
    value: any;

    /** The width of the monitor display. */
    width: number;

    /** The height of the monitor display. */
    height: number;

    /** The x-coordinate of the monitor's position. */
    x: number;

    /** The y-coordinate of the monitor's position. */
    y: number;

    /** Whether the monitor is currently visible. */
    visible: boolean;
  }

  // Monitor definition for variables (with slider config)
  export interface VariableMonitor extends ListMonitor {
    /** Minimum Value. */
    sliderMin: number;

    /** Maximum Value. */
    sliderMax: number;

    /** Whether slider is discrete. */
    isDiscrete: boolean;
  }

  // A monitor can be for a list or a variable
  export type Monitor = ListMonitor | VariableMonitor;

  // Project metadata
  export interface Meta {
    /** Semantic versioning. */
    semver: string;

    /** Virtual machine version. */
    vm: string;

    /** User Agent of client. */
    agent: string;
  }

  // Full project definition
  export interface Project {
    /** Loaded extensions. */
    extensions: string[];

    /** Information about project. */
    meta: Meta;

    /** Monitors. */
    monitors: Monitor[];

    /** Targets. */
    targets: Target[];
  }
}
