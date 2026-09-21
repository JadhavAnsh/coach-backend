import type mongoose from "mongoose"

export type TWithSoftDeleted = {
  isDeleted: boolean
  deletedAt: Date | null
}

export const softDeletePlugin = (schema: mongoose.Schema) => {
  schema.add({
    isDeleted: { type: Boolean, required: true, default: false },
    deletedAt: { type: Date, default: null },
  })

  const excludeDeleted: mongoose.PreMiddlewareFunction<
    mongoose.Query<unknown, unknown>
  > = function (next) {
    this.where({ isDeleted: false })
    next()
  }

  schema.pre("countDocuments", excludeDeleted)
  schema.pre("find", excludeDeleted)
  schema.pre("findOne", excludeDeleted)
  schema.pre("findOneAndUpdate", excludeDeleted)
  schema.pre("updateOne", excludeDeleted)
  schema.pre("updateMany", excludeDeleted)

  schema.pre("aggregate", function (next) {
    this.pipeline().unshift({ $match: { isDeleted: false } })
    next()
  })

  const markDeleted = async function (
    this: mongoose.Query<unknown, mongoose.Document>,
    next: mongoose.CallbackWithoutResultAndOptionalError
  ) {
    const docs = await this.model.find(this.getQuery())
    for (const doc of docs) {
      ;(doc as mongoose.Document & TWithSoftDeleted).isDeleted = true
      ;(doc as mongoose.Document & TWithSoftDeleted).deletedAt = new Date()
      await doc.save()
    }
    next()
  }

  schema.pre("deleteOne", markDeleted)
  schema.pre("findOneAndDelete", markDeleted)
  schema.pre("deleteMany", markDeleted)
}
