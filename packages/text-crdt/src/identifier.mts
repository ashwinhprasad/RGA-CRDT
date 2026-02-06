/**
 * Represents a unique identifier composed of a monotonically increasing
 * counter and a replica identifier.
 *
 * This pattern is commonly used in distributed systems (e.g., CRDTs)
 * to establish ordering and equality across multiple replicas.
 */
export class Identifier {

  /**
   * Logical counter value.
   * Typically increases over time to reflect causal or temporal ordering.
   */
  readonly counter: number;


  /**
   * Unique identifier for the replica (node, client, or process)
   * that generated this identifier.
   */
  readonly replicaId: number;


  constructor(counter: number, replicaId: number) {
    this.counter = counter;
    this.replicaId = replicaId;
  }


  compare(other: Identifier): boolean {
    if (this.counter !== other.counter) {
      return this.counter > other.counter;
    }
    return this.replicaId > other.replicaId;
  }

  equals(other: Identifier): boolean {
    return (
      this.counter === other.counter &&
      this.replicaId === other.replicaId
    );
  }

  toString(): string {
    return `(${this.counter},${this.replicaId})`;
  }
}


